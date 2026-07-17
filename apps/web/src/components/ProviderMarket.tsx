// The live provider market. Quote rows stream in as providers bid on the
// injected lane, each stamped with measured send-to-receipt ms. After award,
// the winner is flagged with the program's verbatim reason.

import type { Job, TimelineEvent } from "../lib/api.js";
import { eth, ms, shortAddr } from "../lib/format.js";
import { Panel, Mono, AddrLink, Empty, LaneBadge } from "./ui.js";

export function ProviderMarket({ job, timeline }: { job: Job | null; timeline: TimelineEvent[] }) {
  if (!job) return <Panel label="Provider market" right={<LaneBadge lane="injected" />}><Empty>Fund a job to open the auction.</Empty></Panel>;

  const measuredFor = (provider: string) =>
    timeline.find((e) => e.kind === "QuoteSubmitted" && String(e.detail.provider).toLowerCase() === provider.toLowerCase())?.measuredMs;
  const sorted = [...job.quotes].sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei)));
  const winner = job.winner?.toLowerCase();

  return (
    <Panel label="Provider market" meta={`#${job.id} · ${job.spec.policy} · ${job.quotes.length}q`} right={<LaneBadge lane="injected" />}>
      {job.quotes.length === 0 ? (
        <Empty>Waiting for bonded providers to quote…</Empty>
      ) : (
        <div className="border border-border">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b bg-card-head px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
            <span>Provider</span><span className="text-right">Price</span><span className="text-right">Latency</span>
          </div>
          {sorted.map((q) => {
            const isWinner = q.provider.toLowerCase() === winner;
            const meas = measuredFor(q.provider);
            return (
              <div key={q.provider} className={`animate-rise grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-border/60 px-2.5 py-2 last:border-0 ${isWinner ? "bg-pass/5" : ""}`}>
                <span className="flex items-center gap-2">
                  <AddrLink addr={q.provider} />
                  {isWinner && <span className="border border-pass/50 px-1 text-[9px] font-bold uppercase tracking-wide text-pass">win</span>}
                </span>
                <Mono className="text-right text-[12px] font-semibold">{eth(q.priceWei)}</Mono>
                <span className="text-right text-[11px] text-muted-fg">
                  <Mono>{ms(q.promisedLatencyMs)}</Mono>
                  {meas !== undefined && <span className="ml-1 text-lane-injected">/ <Mono>{ms(meas)}</Mono>✓</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {job.awardReason && (
        <div className="mt-2.5 border border-pass/30 bg-pass/5 px-2.5 py-2">
          <div className="term-label" style={{ color: "hsl(var(--pass))" }}>Award</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-fg">{job.awardReason}</p>
          {winner && <p className="mt-1 text-[11px]">Winner <Mono className="font-medium">{shortAddr(job.winner)}</Mono></p>}
        </div>
      )}
    </Panel>
  );
}
