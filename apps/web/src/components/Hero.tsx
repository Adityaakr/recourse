// Compact terminal metrics bar: live counters across the top, plus a small 3D
// router widget lit by the two lane colors as the signature element.

import { Suspense } from "react";
import { Scene3D } from "./Scene3D.js";
import { Mono } from "./ui.js";
import { ms } from "../lib/format.js";
import type { Job, TimelineEvent } from "../lib/api.js";

export function Hero({ jobs, timeline }: { jobs: Job[]; timeline: TimelineEvent[] }) {
  const paid = jobs.filter((j) => j.status === "Paid").length;
  const failed = jobs.filter((j) => j.status === "Refunded" || j.status === "Expired").length;
  const measured = timeline.map((e) => e.measuredMs).filter((m): m is number => typeof m === "number");
  const avgMs = measured.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null;

  return (
    <div className="grid grid-cols-[1fr_auto] border border-border bg-card">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Metric label="Jobs routed" value={String(jobs.length)} tone="fg" />
        <Metric label="Paid" value={String(paid)} tone="pass" />
        <Metric label="Refunded / slashed" value={String(failed)} tone="fail" />
        <Metric label="Avg injected" value={avgMs !== null ? ms(avgMs) : "--"} tone="injected" />
      </div>
      <div className="hidden w-[132px] border-l border-border md:block">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <Scene3D />
        </Suspense>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "fg" | "pass" | "fail" | "injected" }) {
  const color = tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : tone === "injected" ? "text-lane-injected" : "text-fg";
  return (
    <div className="border-r border-border px-3.5 py-2.5 last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">{label}</div>
      <div className={`mt-0.5 text-[22px] font-semibold leading-none tnum ${color}`}><Mono>{value}</Mono></div>
    </div>
  );
}
