// Analytics view: terminal charts over live recourse data. Injected-lane
// latency (the fast-lane story), settlement outcomes per job (pay vs
// refund+slash), and the quote spread each auction produced. All SVG, no chart
// lib, styled to the terminal. Everything is real on-chain data; sparse now,
// it fills as jobs run.

import type { Job, TimelineEvent } from "../lib/api.js";
import { Panel, Mono, Empty } from "./ui.js";
import { eth, ms } from "../lib/format.js";

const ETH = (wei: string) => Number(BigInt(wei)) / 1e18;

export function Analytics({ jobs, timeline }: { jobs: Job[]; timeline: TimelineEvent[] }) {
  const latency = timeline
    .filter((e) => e.kind === "QuoteSubmitted")
    .map((e) => e.measuredMs ?? Number((e.detail as { promisedLatencyMs?: number }).promisedLatencyMs ?? 0))
    .filter((n) => n > 0);
  const quotes = jobs.flatMap((j) => j.quotes.map((q) => ({ job: j.id, price: ETH(q.priceWei), latency: q.promisedLatencyMs })));

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[1.6fr_1fr]">
        <Panel label="Injected latency" meta="send to validator-signed receipt, ms">
          {latency.length < 2 ? <Empty>Latency plots as quotes stream in.</Empty> : <AreaChart data={latency} unit="ms" color="var(--lane-injected)" />}
        </Panel>
        <Panel label="Quote latency" meta="per quote">
          {latency.length === 0 ? <Empty>No quotes yet.</Empty> : <BarSeries data={latency} color="var(--lane-injected)" fmt={(v) => ms(Math.round(v))} />}
        </Panel>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-2">
        <Panel label="Settlement outcomes" meta="escrow, pay vs refund+slash">
          {jobs.length === 0 ? <Empty>No settled jobs yet.</Empty> : <OutcomeBars jobs={jobs} />}
        </Panel>
        <Panel label="Quote spread" meta="price per auction, ETH">
          {quotes.length === 0 ? <Empty>No quotes yet.</Empty> : <SpreadChart jobs={jobs} />}
        </Panel>
      </div>
    </div>
  );
}

// ---- area / line chart --------------------------------------------------
function AreaChart({ data, unit, color }: { data: number[]; unit: string; color: string }) {
  const W = 600, H = 200, pad = 8;
  const max = Math.max(...data) * 1.1, min = 0;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  const last = data[data.length - 1];
  return (
    <div className="flex h-full flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1">
        <defs>
          <linearGradient id="af" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={`hsl(${color})`} stopOpacity="0.28" />
            <stop offset="1" stopColor={`hsl(${color})`} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)} stroke="hsl(var(--grid))" strokeWidth="1" />)}
        <path d={area} fill="url(#af)" />
        <path d={line} fill="none" stroke={`hsl(${color})`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <circle cx={x(data.length - 1)} cy={y(last)} r="3.5" fill={`hsl(${color})`} />
      </svg>
      <div className="flex justify-between border-t border-border/60 pt-1.5 text-[10px] text-muted-fg">
        <span>min <Mono className="text-fg">{Math.round(Math.min(...data))}{unit}</Mono></span>
        <span>avg <Mono className="text-fg">{Math.round(data.reduce((a, b) => a + b, 0) / data.length)}{unit}</Mono></span>
        <span>last <span className="tnum" style={{ color: `hsl(${color})` }}>{Math.round(last)}{unit}</span></span>
      </div>
    </div>
  );
}

// ---- bar series ---------------------------------------------------------
function BarSeries({ data, color, fmt }: { data: number[]; color: string; fmt: (v: number) => string }) {
  const max = Math.max(...data) * 1.1;
  return (
    <div className="flex h-full flex-col justify-end gap-1.5">
      <div className="flex min-h-0 flex-1 items-end gap-1.5">
        {data.map((v, i) => (
          <div key={i} className="group relative flex-1" style={{ height: `${(v / max) * 100}%` }} title={fmt(v)}>
            <div className="h-full w-full" style={{ background: `hsl(${color})`, opacity: 0.55 + 0.45 * (v / max) }} />
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 pt-1.5 text-[10px] text-muted-fg">
        peak <Mono className="text-fg">{fmt(Math.max(...data))}</Mono> · {data.length} quotes
      </div>
    </div>
  );
}

// ---- settlement outcomes (up = paid, down = refund) --------------------
function OutcomeBars({ jobs }: { jobs: Job[] }) {
  const rows = jobs.map((j) => ({ id: j.id, escrow: ETH(j.spec.escrowWei), paid: j.status === "Paid", terminal: ["Paid", "Refunded", "Expired"].includes(j.status) }));
  const max = Math.max(...rows.map((r) => r.escrow)) * 1.1 || 1;
  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col items-center justify-center gap-1 border-r border-border/40 last:border-r-0 px-2">
            <div className="flex h-full w-full items-center">
              <div className="w-full" style={{ height: `${(r.escrow / max) * 70}%`, background: r.terminal ? (r.paid ? "hsl(var(--pass))" : "hsl(var(--fail))") : "hsl(var(--muted-fg))", opacity: r.terminal ? 0.85 : 0.4 }} />
            </div>
            <div className="text-[10px]"><Mono className={r.terminal ? (r.paid ? "text-pass" : "text-fail") : "text-muted-fg"}>#{r.id}</Mono></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-border/60 pt-1.5 text-[10px] text-muted-fg">
        <span className="text-pass">■ paid {rows.filter((r) => r.paid).length}</span>
        <span className="text-fail">■ refunded {rows.filter((r) => r.terminal && !r.paid).length}</span>
      </div>
    </div>
  );
}

// ---- quote spread (min..max per job) ------------------------------------
function SpreadChart({ jobs }: { jobs: Job[] }) {
  const rows = jobs.filter((j) => j.quotes.length).map((j) => {
    const ps = j.quotes.map((q) => ETH(q.priceWei));
    return { id: j.id, min: Math.min(...ps), max: Math.max(...ps), win: j.winner ? ETH(j.quotes.find((q) => q.provider.toLowerCase() === j.winner!.toLowerCase())?.priceWei ?? "0") : null };
  });
  if (!rows.length) return <Empty>No quotes yet.</Empty>;
  const hi = Math.max(...rows.map((r) => r.max)) * 1.1;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <Mono className="w-8 shrink-0 text-[11px] text-muted-fg">#{r.id}</Mono>
          <div className="relative h-4 flex-1 bg-muted/40">
            <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-lane-l1/50" style={{ left: `${(r.min / hi) * 100}%`, width: `${((r.max - r.min) / hi) * 100}%` }} />
            {r.win !== null && <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pass" style={{ left: `${(r.win / hi) * 100}%` }} title="winning price" />}
          </div>
          <Mono className="w-16 shrink-0 text-right text-[11px]">{eth(BigInt(Math.round(r.min * 1e18)).toString())}</Mono>
        </div>
      ))}
      <div className="border-t border-border/60 pt-1.5 text-[10px] text-muted-fg"><span className="text-pass">●</span> winning price · <span className="text-lane-l1">▬</span> quote range</div>
    </div>
  );
}
