// Report client-measured injected-lane latencies to the indexer so the UI can
// show the real send-to-validator-signed-receipt ms. Fire-and-forget: the
// indexer is optional, so a failure here never disrupts a service.

const INDEXER = process.env.RECOURSE_INDEXER_URL ?? "http://localhost:8787";

export async function reportQuoteMs(jobId: number, provider: string, ms: number): Promise<void> {
  try {
    await fetch(`${INDEXER}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, provider: provider.toLowerCase(), ms }),
    });
  } catch {
    /* indexer not running; ignore */
  }
}
