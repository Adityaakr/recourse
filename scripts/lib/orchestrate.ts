// Shared demo orchestration. Drives one job through the whole protocol using
// the REAL actor logic — the same SDK, personas, and verifier grading the
// standalone services (bots, verifier, keeper) use — just coordinated in one
// process so a demo run is deterministic and reproducible headless. Everything
// happens on live hoodi; nothing is simulated.

import {
  createRecourse,
  putArtifact,
  type Recourse,
  type Role,
  type Status,
} from "@recourse/sdk";
import { INTERVAL_MERGE } from "@recourse/tasks";
import { reportQuoteMs } from "@recourse/sdk";
import { makePersona, type PersonaName } from "../../packages/bots/src/persona.js";
import { gradeUnitTests } from "../../packages/verifier/src/plugins/unit-tests-v1.js";
import { putEvidence } from "@recourse/sdk";
import { signVerdict } from "../../packages/verifier/src/sign.js";
import { hexToBytes32 } from "./bytes.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface JobParams {
  policy: "cheapest" | "assured";
  escrowWei: bigint;
  maxPriceWei: bigint;
  quoteWindowSecs: number;
  deadlineSecs: number;
}

export interface RunResult {
  jobId: number;
  finalStatus: Status;
  quoteMs: Record<string, number>;
  winner: PersonaName | null;
  verdictPass: boolean | null;
}

/** Register/top-up a persona's bond to the configured floor. */
export async function ensureBonded(r: Recourse, role: Role) {
  const cfg = await r.getConfig();
  const p = await r.getProvider(r.actorId(role));
  if (p && p.bondWei >= cfg.bondWei) return;
  const need = p ? cfg.bondWei - p.bondWei : cfg.bondWei;
  await r.l1(role, "Market", p ? "TopUpBond" : "RegisterProvider", [], need);
}

/**
 * Make sure a role's internal balance covers `amount`, depositing the shortfall
 * on L1 if needed. This is the one gas payment behind gasless funding: value
 * can only enter the program on the classic lane (injected calls are purged if
 * they carry value), so we load the balance once, then spend it via injected
 * `create_job`.
 */
export async function ensureDeposited(r: Recourse, role: Role, amount: bigint) {
  const actor = r.actorId(role);
  const have = await r.balanceOf(actor);
  if (have >= amount) return;
  await r.l1(role, "Market", "Deposit", [], amount - have);
  // The deposit is an L1 message; the tx confirming does not mean the program
  // has processed it. Wait for the credit to land before the caller funds.
  for (let i = 0; i < 20; i++) {
    if ((await r.balanceOf(actor)) >= amount) return;
    await sleep(3000);
  }
  throw new Error(`deposit for ${role} did not credit in time`);
}

async function nextJobId(r: Recourse): Promise<number> {
  for (let i = 0; i < 256; i++) if (!(await r.getJob(i))) return i;
  throw new Error("no free job id");
}

async function waitFor(r: Recourse, id: number, want: (s: Status) => boolean): Promise<Status> {
  for (let i = 0; i < 40; i++) {
    const j = await r.getJob(id);
    if (j && want(j.status)) return j.status;
    await sleep(4000);
  }
  throw new Error(`timed out waiting on job ${id}`);
}

/**
 * Full lifecycle for one job. `bots` are the personas that will quote; the
 * winner is decided on-chain by the policy. On a win the winning persona
 * either delivers (verifier grades → pay/refund) or sandbags (timeout mode →
 * keeper expires).
 */
export async function runJob(
  r: Recourse,
  bots: PersonaName[],
  params: JobParams,
  log: (m: string) => void,
): Promise<RunResult> {
  const task = INTERVAL_MERGE;
  for (const b of bots) await ensureBonded(r, makePersona(b).role);

  const jobId = await nextJobId(r);
  // One L1 deposit loads the escrow into the requester's internal balance...
  await ensureDeposited(r, "requester", params.escrowWei);
  // ...then funding the job is a gasless injected call that debits it.
  const { ms: fundMs } = await r.injected("requester", "Market", "CreateJob", [
    params.escrowWei, params.maxPriceWei, params.deadlineSecs, "unit-tests-v1",
    hexToBytes32(task.criteriaHash), params.policy, params.quoteWindowSecs,
  ]);
  await waitFor(r, jobId, (s) => s === "Open");
  log(`job ${jobId} created (${params.policy}), Open — funded gasless on the injected lane in ${fundMs}ms`);

  // Each persona quotes on the injected lane.
  const quoteMs: Record<string, number> = {};
  for (const name of bots) {
    const persona = makePersona(name);
    const price = (params.maxPriceWei * BigInt(Math.round(persona.priceFraction * 100))) / 100n;
    const { ms } = await r.injected(persona.role, "Market", "SubmitQuote", [
      jobId, price, persona.promisedLatencyMs,
    ]);
    quoteMs[name] = ms;
    await reportQuoteMs(jobId, r.actorId(persona.role), ms);
    log(`  ${name} quoted ${price} wei in ${ms}ms (injected, validator-signed)`);
  }

  // Keeper awards once the window closes (retries against the program clock).
  log(`awaiting the ${params.quoteWindowSecs}s quote window...`);
  await r.injected("keeper", "Market", "AwardJob", [jobId], { retryOn: "window still open", tries: 15 });
  const awarded = await r.getJob(jobId);
  const winnerAddr = awarded?.winner?.toLowerCase();
  const winner = bots.find((b) => r.actorId(makePersona(b).role).toLowerCase() === winnerAddr) ?? null;
  log(`awarded to ${winner ?? "?"} — reason: ${awarded?.awardReason}`);

  if (!winner) {
    const s = await waitFor(r, jobId, (st) => st !== "Open" && st !== "Awarded");
    return { jobId, finalStatus: s, quoteMs, winner: null, verdictPass: null };
  }

  // Winner executes.
  const persona = makePersona(winner);
  const solution = await persona.solve(task);
  if (solution === null) {
    log(`  ${winner} sandbagged (timeout mode) — not delivering; keeper will expire`);
    await r.injected("keeper", "Settlement", "ExpireJob", [jobId], { retryOn: "not past", tries: 20 });
    const s = await waitFor(r, jobId, (st) => st === "Expired");
    return { jobId, finalStatus: s, quoteMs, winner, verdictPass: null };
  }

  const outputHash = putArtifact(solution);
  await r.injected(winner === "cheapskate" ? "bot-cheapskate" : `bot-${winner}` as Role, "Settlement", "SubmitReceipt", [
    jobId, hexToBytes32(outputHash), `${winner}:${process.env.RECOURSE_MODEL_BACKEND ?? "mock"}`,
  ]);
  await waitFor(r, jobId, (s) => s === "Delivered");
  log(`  ${winner} delivered output ${outputHash.slice(0, 14)}…`);

  // Verifier grades and posts the verdict.
  const grade = gradeUnitTests(solution, task);
  const evidenceHash = putEvidence(jobId, grade.evidence);
  const signed = await signVerdict(jobId, grade.pass, evidenceHash);
  log(`  verifier: ${grade.pass ? "PASS" : "FAIL"} (eip-191 ${signed.signature.slice(0, 12)}…)`);
  await r.injected("verifier", "Settlement", "SubmitVerdict", [jobId, grade.pass, hexToBytes32(evidenceHash)]);
  const s = await waitFor(r, jobId, (st) => st === "Paid" || st === "Refunded");
  return { jobId, finalStatus: s, quoteMs, winner, verdictPass: grade.pass };
}

export async function connect(): Promise<Recourse> {
  const { readDeployment } = await import("@recourse/sdk");
  return createRecourse({ programId: readDeployment().programId, apiSigner: "deployer" });
}
