// Analytics: professional charts over live recourse data, built with Recharts
// and themed monochrome from the CSS variables. Injected-lane latency, the
// quote-latency distribution, settlement outcomes, and the winning price per
// auction. Everything is real on-chain data; sparse now, it fills as jobs run.

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import type { Job, TimelineEvent } from "../lib/api.js";
import { Panel, Empty } from "./ui.js";

const ETH = (wei: string) => Number(BigInt(wei)) / 1e18;

/** Read the monochrome palette from CSS vars, re-read on theme change. */
function useColors() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => `hsl(${s.getPropertyValue(n).trim()})`;
    return { fg: v("--fg"), muted: v("--muted-fg"), grid: v("--grid"), inj: v("--lane-injected"), l1: v("--lane-l1"), fail: v("--fail"), card: v("--card"), border: v("--border") };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

const AXIS = (fill: string) => ({ tick: { fill, fontSize: 10, fontFamily: "JetBrains Mono" }, tickLine: false, axisLine: false });

function TT({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-card px-2 py-1 text-[11px] shadow-float">
      <div className="text-muted-fg">{label}</div>
      <div className="tnum font-semibold">{payload[0].value}{unit}</div>
    </div>
  );
}

export function Analytics({ jobs, timeline }: { jobs: Job[]; timeline: TimelineEvent[] }) {
  const c = useColors();

  const latency = timeline
    .filter((e) => e.kind === "QuoteSubmitted")
    .map((e, i) => ({ i: i + 1, ms: e.measuredMs ?? Number((e.detail as { promisedLatencyMs?: number }).promisedLatencyMs ?? 0) }))
    .filter((d) => d.ms > 0);

  const outcomes = jobs.map((j) => ({
    job: `#${j.id}`, escrow: +ETH(j.spec.escrowWei).toFixed(4),
    good: j.status === "Paid", terminal: ["Paid", "Refunded", "Expired"].includes(j.status),
  }));

  const winPrice = jobs
    .filter((j) => j.winner)
    .map((j) => ({ job: `#${j.id}`, price: +ETH(j.quotes.find((q) => q.provider.toLowerCase() === j.winner!.toLowerCase())?.priceWei ?? "0").toFixed(4) }));

  return (
    <div className="grid h-full grid-rows-2 gap-2.5">
      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-[1.7fr_1fr]">
        <Panel label="Injected latency" meta="send to validator-signed receipt, ms" bodyClass="!p-2">
          {latency.length < 2 ? <Empty>Latency plots as quotes stream in.</Empty> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latency} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.inj} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={c.inj} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="i" {...AXIS(c.muted)} />
                <YAxis {...AXIS(c.muted)} width={40} />
                <Tooltip content={(p) => <TT {...p} unit="ms" />} cursor={{ stroke: c.border }} />
                <Area type="monotone" dataKey="ms" stroke={c.inj} strokeWidth={1.6} fill="url(#lat)" dot={false} activeDot={{ r: 3, fill: c.fg }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel label="Quote latency" meta="per quote, ms" bodyClass="!p-2">
          {latency.length === 0 ? <Empty>No quotes yet.</Empty> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latency} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="i" {...AXIS(c.muted)} />
                <YAxis {...AXIS(c.muted)} width={40} />
                <Tooltip content={(p) => <TT {...p} unit="ms" />} cursor={{ fill: c.grid }} />
                <Bar dataKey="ms" fill={c.l1} radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
        <Panel label="Settlement outcomes" meta="escrow per job; filled = paid, hollow = refunded" bodyClass="!p-2">
          {outcomes.length === 0 ? <Empty>No jobs yet.</Empty> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="job" {...AXIS(c.muted)} />
                <YAxis {...AXIS(c.muted)} width={44} />
                <Tooltip content={(p) => <TT {...p} unit=" ETH" />} cursor={{ fill: c.grid }} />
                <Bar dataKey="escrow" radius={[1, 1, 0, 0]}>
                  {outcomes.map((o, i) => (
                    <Cell key={i} fill={o.good ? c.fg : c.card} stroke={o.terminal ? c.fg : c.muted} strokeWidth={o.good ? 0 : 1.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel label="Winning price" meta="per auction, ETH" bodyClass="!p-2">
          {winPrice.length < 2 ? <Empty>Winning prices plot as auctions settle.</Empty> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={winPrice} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="job" {...AXIS(c.muted)} />
                <YAxis {...AXIS(c.muted)} width={44} />
                <Tooltip content={(p) => <TT {...p} unit=" ETH" />} cursor={{ stroke: c.border }} />
                <Line type="monotone" dataKey="price" stroke={c.fg} strokeWidth={1.6} dot={{ r: 2.5, fill: c.fg }} activeDot={{ r: 3.5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
