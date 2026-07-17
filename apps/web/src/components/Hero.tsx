// Hero — the thesis, stated once. The headline names what recourse does; the
// 3D prism to its right is the router lit by the two lanes. Below sits a stat
// strip summarizing live state before the detail panels.

import { Suspense } from "react";
import { Zap, Layers, CircleDollarSign, Timer } from "lucide-react";
import { Scene3D } from "./Scene3D.js";
import { Mono, IconBadge } from "./ui.js";
import { ms } from "../lib/format.js";
import type { Job, TimelineEvent } from "../lib/api.js";

export function Hero({ jobs, timeline }: { jobs: Job[]; timeline: TimelineEvent[] }) {
  const paid = jobs.filter((j) => j.status === "Paid").length;
  const failed = jobs.filter((j) => j.status === "Refunded" || j.status === "Expired").length;
  const measured = timeline.map((e) => e.measuredMs).filter((m): m is number => typeof m === "number");
  const avgMs = measured.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border bg-card shadow-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-lane-injected/8" />
        <div className="relative grid items-center gap-6 p-7 md:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-fg backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-pass" /> Live on vara.eth · hoodi testnet
            </div>
            <h1 className="max-w-lg text-[26px] font-semibold leading-tight tracking-tight text-fg">
              Decides where a request goes — and whether the provider deserves to be paid.
            </h1>
            <p className="mt-2.5 max-w-md text-sm text-muted-fg">
              Agents fund a job with a machine-checkable success test. Bonded providers bid on the
              fast lane; the protocol grades the result and settles — pay on pass, refund and slash on fail.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <LaneChip tone="injected" icon={<Zap size={13} />} label="Injected lane" note="sub-second · gasless" />
              <LaneChip tone="l1" icon={<Layers size={13} />} label="Ethereum L1" note="carries value · ~12s" />
            </div>
          </div>
          <div className="mx-auto h-[220px] w-full max-w-[320px]">
            <Suspense fallback={<div className="h-full w-full animate-pulse rounded-2xl bg-muted" />}>
              <Scene3D />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="primary" icon={<Layers size={16} />} label="Jobs routed" value={String(jobs.length)} />
        <Stat tone="pass" icon={<CircleDollarSign size={16} />} label="Paid on success" value={String(paid)} />
        <Stat tone="fail" icon={<CircleDollarSign size={16} />} label="Refunded + slashed" value={String(failed)} />
        <Stat tone="injected" icon={<Timer size={16} />} label="Avg injected latency" value={avgMs !== null ? ms(avgMs) : "—"} mono />
      </div>
    </div>
  );
}

function LaneChip({ tone, icon, label, note }: { tone: "injected" | "l1"; icon: React.ReactNode; label: string; note: string }) {
  const color = tone === "injected" ? "text-lane-injected bg-lane-injected/10" : "text-lane-l1 bg-lane-l1/10";
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5">
      <span className={`grid h-6 w-6 place-items-center rounded-lg ${color}`}>{icon}</span>
      <span className="text-xs"><span className="font-semibold text-fg">{label}</span> <span className="text-muted-fg">· {note}</span></span>
    </span>
  );
}

function Stat({ tone, icon, label, value, mono }: {
  tone: "primary" | "pass" | "fail" | "injected"; icon: React.ReactNode; label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 shadow-card">
      <IconBadge tone={tone}>{icon}</IconBadge>
      <div>
        <div className="text-xs text-muted-fg">{label}</div>
        <div className={`text-2xl font-semibold tracking-tight ${mono ? "tnum" : ""}`}>{mono ? <Mono>{value}</Mono> : value}</div>
      </div>
    </div>
  );
}
