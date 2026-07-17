// The keeper. Programs on vara.eth cannot wake themselves, so an external
// worker nudges time-gated transitions: it awards jobs whose quote window has
// closed (frontend is the primary caller; keeper is the backstop) and expires
// awarded jobs whose deadline has passed. It never decides outcomes — it only
// tells the program "time has moved," and the program does the rest. Liveness
// does not depend on it: award and expire are permissionless, so anyone can
// call them; the keeper is just the reliable on-camera trigger.

import pino from "pino";
import { createRecourse, readDeployment, type Recourse } from "@recourse/sdk";

const log = pino({ transport: { target: "pino-pretty", options: { colorize: true } } });
const POLL_MS = 5000;

/** Try a time-gated transition; a program rejection means "not ready yet",
 *  which is normal for a poller and logged quietly. */
async function tryTransition(
  r: Recourse,
  method: "AwardJob" | "ExpireJob",
  service: "Market" | "Settlement",
  jobId: number,
) {
  try {
    const { ms } = await r.injected("keeper", service, method, [jobId]);
    log.info({ job: jobId, method, ms }, "transition fired (injected)");
    return true;
  } catch (e) {
    const msg = String(e);
    if (msg.includes("still open") || msg.includes("not past") || msg.includes("not allowed")) {
      log.debug({ job: jobId, method }, "not ready yet");
    } else {
      log.warn({ job: jobId, method, err: msg }, "transition error");
    }
    return false;
  }
}

async function main() {
  const d = readDeployment();
  const r = await createRecourse({ programId: d.programId, apiSigner: "keeper" });
  log.info({ program: d.programId }, "keeper online");

  for (;;) {
    try {
      const jobs = await r.listJobs(null, 0, 64);
      for (const job of jobs) {
        if (job.status === "Open") {
          await tryTransition(r, "AwardJob", "Market", job.id);
        } else if (job.status === "Awarded" || job.status === "Running") {
          await tryTransition(r, "ExpireJob", "Settlement", job.id);
        }
      }
    } catch (e) {
      const msg = String(e);
      // Expected during the SDK's background reconnect; retry immediately.
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
  log.error({ err: String(e) }, "keeper crashed");
  process.exit(1);
});
