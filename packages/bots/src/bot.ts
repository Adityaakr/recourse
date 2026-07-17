// A provider bot. One binary; RECOURSE_PERSONA (or argv[2]) selects the
// persona. Loop: register (post bond) once, then watch open jobs, quote the
// ones it can on the injected lane, and when it wins a job, solve the task and
// deliver a receipt. Value moves only when posting the bond (L1); quoting and
// delivery ride the injected fast lane.

import pino from "pino";
import {
  createRecourse,
  readDeployment,
  putArtifact,
  type Job,
  type Recourse,
} from "@recourse/sdk";
import { taskByCriteria } from "@recourse/tasks";
import { makePersona, type PersonaName } from "./persona.js";

const log = pino({ transport: { target: "pino-pretty", options: { colorize: true } } });
const POLL_MS = 2500;

const personaName = (process.env.RECOURSE_PERSONA || process.argv[2]) as PersonaName;
if (!personaName) {
  log.error("set RECOURSE_PERSONA=steady|cheapskate|premium (or pass as argv)");
  process.exit(1);
}

async function ensureBonded(r: Recourse, role: Parameters<Recourse["actorId"]>[0]) {
  const existing = await r.getProvider(r.actorId(role));
  const cfg = await r.getConfig();
  if (existing && existing.bondWei >= cfg.bondWei) {
    log.info({ bond: existing.bondWei.toString() }, "already bonded");
    return;
  }
  const need = existing ? cfg.bondWei - existing.bondWei : cfg.bondWei;
  const tx = await r.l1(role, "Market", existing ? "TopUpBond" : "RegisterProvider", [], need);
  log.info({ tx, bond: cfg.bondWei.toString() }, existing ? "topped up bond" : "registered + bonded");
}

async function main() {
  const persona = makePersona(personaName);
  const d = readDeployment();
  const r = await createRecourse({ programId: d.programId, apiSigner: persona.role });
  const me = r.actorId(persona.role).toLowerCase();
  log.info({ persona: persona.name, role: persona.role, program: d.programId }, "bot online");

  await ensureBonded(r, persona.role);

  const quoted = new Set<number>();
  const delivered = new Set<number>();

  for (;;) {
    try {
      const jobs = await r.listJobs(null, 0, 64);
      for (const job of jobs) {
        // Quote open jobs we can serve.
        if (job.status === "Open" && !quoted.has(job.id) && taskByCriteria(job.spec.criteriaHash)) {
          const price = (job.spec.maxPriceWei * BigInt(Math.round(persona.priceFraction * 100))) / 100n;
          try {
            const { ms } = await r.injected(persona.role, "Market", "SubmitQuote", [
              job.id, price, persona.promisedLatencyMs,
            ]);
            quoted.add(job.id);
            log.info({ job: job.id, price: price.toString(), ms }, "quoted (injected)");
          } catch (e) {
            // Losing races (busy, already quoted, window closed) are expected.
            log.debug({ job: job.id, err: String(e) }, "quote skipped");
            quoted.add(job.id);
          }
        }

        // Deliver jobs we won.
        const iWon = job.winner?.toLowerCase() === me;
        if (iWon && !delivered.has(job.id) && (job.status === "Awarded" || job.status === "Running")) {
          await deliver(r, persona, job);
          delivered.add(job.id);
        }
      }
    } catch (e) {
      log.error({ err: String(e) }, "loop error");
    }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

async function deliver(r: Recourse, persona: ReturnType<typeof makePersona>, job: Job) {
  const l = log.child({ job: job.id });
  const task = taskByCriteria(job.spec.criteriaHash);
  if (!task) return;
  l.info("won — solving task");
  const solution = await persona.solve(task);
  if (solution === null) {
    l.warn("sandbagging (timeout mode): not delivering — the keeper will expire this job");
    return;
  }
  const outputHash = putArtifact(solution);
  const modelTag = `${persona.name}:${process.env.RECOURSE_MODEL_BACKEND ?? "mock"}`;
  const { ms } = await r.injected(persona.role, "Settlement", "SubmitReceipt", [
    job.id, hexToBytes32(outputHash), modelTag,
  ]);
  l.info({ outputHash, modelTag, ms }, "receipt delivered (injected)");
}

function hexToBytes32(hex: `0x${string}`): Uint8Array {
  return Uint8Array.from((hex.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
}

main().catch((e) => {
  log.error({ err: String(e) }, "bot crashed");
  process.exit(1);
});
