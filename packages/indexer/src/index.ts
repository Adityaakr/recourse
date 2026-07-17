// Indexer + read API for the frontend. Polls the live program state on hoodi
// through the SDK (real chain reads — nothing here is simulated), derives an
// event timeline tagged by lane, and serves it as JSON + a Server-Sent-Events
// stream. Services POST their client-measured injected-lane latencies to
// /api/telemetry so the UI can show the real send-to-receipt milliseconds.
//
// Lane tagging (the product's core visual): value-bearing calls ride L1, the
// rest ride the injected fast lane.
//
// Run: pnpm --filter @recourse/indexer start   (PORT defaults to 8787)

import { createServer } from "node:http";
import { createRecourse, readDeployment, type Job, type Recourse } from "@recourse/sdk";

const PORT = Number(process.env.PORT ?? 8787);
const POLL_MS = 2000;

type Lane = "injected" | "l1" | "settlement";

interface TimelineEvent {
  seq: number;
  jobId: number;
  kind: string;
  lane: Lane;
  at: string; // ISO
  detail: Record<string, unknown>;
  measuredMs?: number;
}

const EVENT_LANE: Record<string, Lane> = {
  JobCreated: "l1",
  ProviderRegistered: "l1",
  QuoteSubmitted: "injected",
  JobAwarded: "injected",
  ReceiptSubmitted: "injected",
  VerdictSubmitted: "injected",
  JobSettled: "settlement",
  JobExpired: "settlement",
};

// -- in-memory state, refreshed from chain --------------------------------
let config: Awaited<ReturnType<Recourse["getConfig"]>> | null = null;
let jobs: Job[] = [];
const timeline: TimelineEvent[] = [];
const seen = new Set<string>();
let seq = 0;
// jobId -> provider addr -> measured quote ms, reported by services.
const measured = new Map<string, number>();
const sseClients = new Set<(e: string) => void>();

function jsonReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

function emit(ev: TimelineEvent) {
  timeline.push(ev);
  const payload = `event: timeline\ndata: ${JSON.stringify(ev, jsonReplacer)}\n\n`;
  for (const send of sseClients) send(payload);
}

/** Derive timeline events from the delta between two views of a job. */
function diffJob(prev: Job | undefined, next: Job) {
  const push = (kind: string, detail: Record<string, unknown>, measuredMs?: number) => {
    const key = `${next.id}:${kind}:${detail.k ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    emit({ seq: seq++, jobId: next.id, kind, lane: EVENT_LANE[kind] ?? "injected", at: new Date().toISOString(), detail, measuredMs });
  };

  if (!prev) push("JobCreated", { requester: next.spec.requester, maxPriceWei: next.spec.maxPriceWei.toString(), escrowWei: next.spec.escrowWei.toString(), policy: next.spec.policy });
  const prevQuotes = prev?.quotes.length ?? 0;
  for (let i = prevQuotes; i < next.quotes.length; i++) {
    const q = next.quotes[i]!;
    push("QuoteSubmitted", { k: q.provider, provider: q.provider, priceWei: q.priceWei.toString(), promisedLatencyMs: q.promisedLatencyMs }, measured.get(`${next.id}:${q.provider.toLowerCase()}`));
  }
  if (next.winner && !prev?.winner) push("JobAwarded", { winner: next.winner, reason: next.awardReason });
  if (next.receipt && !prev?.receipt) push("ReceiptSubmitted", { outputHash: next.receipt.outputHash, modelTag: next.receipt.modelTag });
  if (next.verdict && !prev?.verdict) push("VerdictSubmitted", { pass: next.verdict.pass, evidenceHash: next.verdict.evidenceHash });
  if (next.settled && !prev?.settled) {
    if (next.status === "Expired") push("JobExpired", { k: "exp" });
    push("JobSettled", { outcome: next.settled, status: next.status });
  }
}

async function poll(r: Recourse) {
  if (!config) config = await r.getConfig();
  const next: Job[] = [];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  for (let id = 0; id < 256; id++) {
    const j = await r.getJob(id);
    if (!j) break;
    next.push(j);
    diffJob(byId.get(id), j);
  }
  jobs = next;
}

// -- http ------------------------------------------------------------------
function send(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(body, jsonReplacer));
}

async function main() {
  const d = readDeployment();
  const r = await createRecourse({ programId: d.programId, apiSigner: "deployer" });
  // eslint-disable-next-line no-console
  console.log(`[indexer] watching ${d.programId} on hoodi`);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") return send(res, 204, {});

    if (url.pathname === "/api/state") {
      return send(res, 200, { deployment: d, config, jobs, timeline: timeline.slice(-200) });
    }
    if (url.pathname === "/api/telemetry" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const { jobId, provider, ms } = JSON.parse(raw);
          measured.set(`${jobId}:${String(provider).toLowerCase()}`, ms);
        } catch { /* ignore malformed */ }
        send(res, 200, { ok: true });
      });
      return;
    }
    if (url.pathname === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
      res.write(`event: hello\ndata: {"program":"${d.programId}"}\n\n`);
      const client = (e: string) => res.write(e);
      sseClients.add(client);
      req.on("close", () => sseClients.delete(client));
      return;
    }
    send(res, 404, { error: "not found" });
  });
  server.listen(PORT, () => console.log(`[indexer] http://localhost:${PORT}`));

  for (;;) {
    try { await poll(r); } catch (e) { console.error("[indexer] poll error", String(e)); }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

main().catch((e) => { console.error("[indexer] crashed", e); process.exit(1); });
