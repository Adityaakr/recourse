// The live provider market. Quote rows stream in as providers bid on the
// injected lane, each stamped with measured send-to-receipt ms. After award,
// the winner is flagged with the program's verbatim reason. Below it, a live 3D
// arena shows the same auction spatially: cheaper bids sit closer to the router.

import { Suspense } from "react";
import type { Job, TimelineEvent } from "../lib/api.js";
import { eth, ms } from "../lib/format.js";
import { Panel, Mono, AddrLink, Empty, LaneBadge } from "./ui.js";
import { MarketScene3D } from "./MarketScene3D.js";

export function ProviderMarket({ job, timeline }: { job: Job | null; timeline: TimelineEvent[] }) {
  if (!job) return <Panel label="Provider market" right={<LaneBadge lane="injected" />}><Empty>Fund a job to open the auction.</Empty></Panel>;

  const measuredFor = (provider: string) =>
    timeline.find((e) => e.kind === "QuoteSubmitted" && String(e.detail.provider).toLowerCase() === provider.toLowerCase())?.measuredMs;
  const sorted = [...job.quotes].sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei)));
  const winner = job.winner?.toLowerCase();
  const open = job.status === "Open";

  return (
    <Panel label="Provider market" meta={`#${job.id} · ${job.spec.policy} · ${job.quotes.length}q`} right={<LaneBadge lane="injected" />} bodyClass="flex flex-col">
      {/* Live bidding summary — the current cheapest quote (request: show what's being quoted now). */}
      {job.quotes.length > 0 && (
        <div className="mb-2 flex shrink-0 items-center justify-between border border-border bg-muted/30 px-2.5 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-fg">
            {open && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg" />}
            {open ? "Lowest bid so far" : "Winning bid"}
          </span>
          <span className="flex items-center gap-2">
            <Mono className="font-semibold">{eth(sorted[0]!.priceWei)} ETH</Mono>
            <span className="text-muted-fg"><Mono>{ms(sorted[0]!.promisedLatencyMs)}</Mono></span>
          </span>
        </div>
      )}

      {job.quotes.length === 0 ? (
        <div className="shrink-0 border border-border px-2.5 py-3 text-center text-[11px] text-muted-fg">
          {open ? "Waiting for bonded providers to quote…" : "No quotes were submitted in the window."}
        </div>
      ) : (
        <div className="shrink-0 border border-border">
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
        <div className="mt-2.5 shrink-0 border border-pass/30 bg-pass/5 px-2.5 py-2">
          <div className="term-label" style={{ color: "hsl(var(--pass))" }}>Award</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-fg">{job.awardReason}</p>
          {winner && <p className="mt-1 text-[11px]">Winner <AddrLink addr={job.winner!} /></p>}
        </div>
      )}

      {/* Live 3D arena fills the remaining space: router at center, each provider
          pulled closer the cheaper it bids, the winner glowing. */}
      <div className="relative mt-2.5 min-h-[200px] flex-1 border border-border bg-bg">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <MarketScene3D job={job} />
        </Suspense>
        <div className="pointer-events-none absolute bottom-1.5 left-2.5 text-[9.5px] uppercase tracking-wide text-muted-fg/80">
          closer = cheaper · glowing = awarded
        </div>
      </div>
    </Panel>
  );
}
