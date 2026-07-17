// Panel 2 — the live provider market. Quote cards stream in as providers bid
// on the injected lane, each stamped with its measured send-to-receipt ms (the
// pitch). After award, the winner is highlighted with the program's verbatim
// reason.

import type { Job, TimelineEvent } from "../lib/api.js";
import { eth, ms, shortAddr } from "../lib/format.js";
import { Panel, Mono, AddrLink, Empty, LaneBadge } from "./ui.js";

export function ProviderMarket({ job, timeline }: { job: Job | null; timeline: TimelineEvent[] }) {
  if (!job) return <Panel title="Live provider market"><Empty>Fund a job to open the auction.</Empty></Panel>;

  const measuredFor = (provider: string) =>
    timeline.find((e) => e.kind === "QuoteSubmitted" && String(e.detail.provider).toLowerCase() === provider.toLowerCase())?.measuredMs;

  const sorted = [...job.quotes].sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei)));
  const winner = job.winner?.toLowerCase();

  return (
    <Panel
      title="Live provider market"
      hint={`Job #${job.id} · ${job.spec.policy} · ${job.quotes.length} quote${job.quotes.length === 1 ? "" : "s"}`}
      right={<LaneBadge lane="injected" />}
    >
      {job.quotes.length === 0 ? (
        <Empty>Waiting for bonded providers to quote…</Empty>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((q) => {
            const isWinner = q.provider.toLowerCase() === winner;
            const meas = measuredFor(q.provider);
            return (
              <li
                key={q.provider}
                className={`animate-rise rounded-xl border p-3.5 ${isWinner ? "border-pass/50 bg-pass/5" : "bg-muted/30"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium"><AddrLink addr={q.provider} /></span>
                    {isWinner && <span className="rounded-full bg-pass/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pass">won</span>}
                  </div>
                  <Mono className="text-sm font-semibold">{eth(q.priceWei)} ETH</Mono>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>promised <Mono className="text-foreground">{ms(q.promisedLatencyMs)}</Mono></span>
                  {meas !== undefined && (
                    <span className="text-lane-injected">measured <Mono>{ms(meas)}</Mono> · validator-signed ✓</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {job.awardReason && (
        <div className="mt-4 rounded-lg border border-pass/30 bg-pass/5 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-pass">Award decision</div>
          <p className="mt-1 text-xs text-muted-foreground">{job.awardReason}</p>
          {winner && <p className="mt-1 text-xs">Winner: <span className="font-medium">{shortAddr(job.winner)}</span></p>}
        </div>
      )}
    </Panel>
  );
}
