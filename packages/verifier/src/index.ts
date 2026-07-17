// The verifier service. Single allowlisted grader (v1). Watches for delivered
// jobs, fetches the provider's output off-chain by its hash, runs the task's
// hidden tests in a sandbox, writes an evidence bundle, signs an eip-191
// verdict for the audit trail, and submits the on-chain verdict (injected
// lane) — which the program accepts because the message source is the
// configured verifier ActorId. Settlement runs inline in the program.

import pino from "pino";
import {
  createRecourse,
  readDeployment,
  getArtifact,
  putEvidence,
  type Job,
  type Recourse,
} from "@recourse/sdk";
import { taskByCriteria } from "@recourse/tasks";
import { gradeUnitTests } from "./plugins/unit-tests-v1.js";
import { gradeJsonSchema } from "./plugins/json-schema-v1.js";
import { signVerdict } from "./sign.js";

const log = pino({ transport: { target: "pino-pretty", options: { colorize: true } } });
const POLL_MS = 3000;

async function verifyJob(r: Recourse, job: Job): Promise<void> {
  const l = log.child({ job: job.id });
  const task = taskByCriteria(job.spec.criteriaHash);
  if (!task) {
    l.warn({ criteria: job.spec.criteriaHash }, "no task for criteria hash — cannot grade");
    return;
  }
  const output = job.receipt ? getArtifact(job.receipt.outputHash) : null;
  if (output === null) {
    l.warn("delivered output not found in the artifact store yet");
    return;
  }

  const result =
    job.spec.verifierKind === "unit-tests-v1"
      ? gradeUnitTests(output, task)
      : gradeJsonSchema(output, task);

  const evidenceHash = putEvidence(job.id, result.evidence);
  const signed = await signVerdict(job.id, result.pass, evidenceHash);
  l.info(
    { pass: result.pass, evidenceHash, sig: `${signed.signature.slice(0, 14)}…` },
    result.pass ? "PASS — tests green" : "FAIL — tests red",
  );

  const { ms } = await r.injected("verifier", "Settlement", "SubmitVerdict", [
    job.id,
    result.pass,
    hexToBytes32(evidenceHash),
  ]);
  l.info({ ms }, "verdict submitted (injected); program settled inline");
}

function hexToBytes32(hex: `0x${string}`): Uint8Array {
  return Uint8Array.from((hex.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
}

async function main() {
  const d = readDeployment();
  const r = await createRecourse({ programId: d.programId, apiSigner: "verifier" });
  log.info({ program: d.programId, verifier: r.actorId("verifier") }, "verifier online");

  const done = new Set<number>();
  for (;;) {
    try {
      const jobs = await r.listJobs("Delivered", 0, 64);
      for (const job of jobs) {
        if (done.has(job.id)) continue;
        done.add(job.id);
        await verifyJob(r, job).catch((e) => {
          done.delete(job.id); // let it retry next round
          log.error({ job: job.id, err: String(e) }, "verify failed");
        });
      }
    } catch (e) {
      const msg = String(e);
      // Expected during the SDK's background reconnect to a fresh validator;
      // it self-heals next iteration, so retry immediately without a scary log.
      if (msg.includes("manually closed") || msg.includes("Connection")) {
        await new Promise((res) => setTimeout(res, 300));
        continue;
      }
      log.error({ err: msg }, "poll failed");
    }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

main().catch((e) => {
  log.error({ err: String(e) }, "verifier crashed");
  process.exit(1);
});
