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
  await r.l1("requester", "Market", "CreateJob", [
    params.maxPriceWei, params.deadlineSecs, "unit-tests-v1",
    hexToBytes32(task.criteriaHash), params.policy, params.quoteWindowSecs,
  ], params.escrowWei);
  await waitFor(r, jobId, (s) => s === "Open");
  log(`job ${jobId} created (${params.policy}), Open`);

  // Each persona quotes on the injected lane.
  const quoteMs: Record<string, number> = {};
  for (const name of bots) {
    const persona = makePersona(name);
    const price = (params.maxPriceWei * BigInt(Math.round(persona.priceFraction * 100))) / 100n;
    const { ms } = await r.injected(persona.role, "Market", "SubmitQuote", [
      jobId, price, persona.promisedLatencyMs,
    ]);
    quoteMs[name] = ms;
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
