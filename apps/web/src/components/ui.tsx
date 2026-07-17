// Shared UI primitives — all colors/spacing from tokens, numbers monospaced,
// the two lanes color-coded consistently.

import type { ReactNode } from "react";
import type { Status, Lane } from "../lib/api.js";
import { HOODI_ADDR } from "../lib/format.js";
import { shortAddr } from "../lib/format.js";

export function Panel({ title, hint, right, children }: {
  title: string; hint?: string; right?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </header>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  Open: "text-muted-foreground bg-muted",
  Awarded: "text-pending bg-pending/10",
  Running: "text-pending bg-pending/10",
  Delivered: "text-lane-injected bg-lane-injected/10",
  Verified: "text-lane-injected bg-lane-injected/10",
  Paid: "text-pass bg-pass/10",
  Refunded: "text-fail bg-fail/10",
  Expired: "text-fail bg-fail/10",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const LANE_META: Record<Lane, { label: string; cls: string }> = {
  injected: { label: "injected", cls: "text-lane-injected bg-lane-injected/10 ring-lane-injected/30" },
  l1: { label: "L1", cls: "text-lane-l1 bg-lane-l1/10 ring-lane-l1/30" },
  settlement: { label: "settle", cls: "text-muted-foreground bg-muted ring-border" },
};

export function LaneBadge({ lane }: { lane: Lane }) {
  const m = LANE_META[lane];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${m.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{m.label}
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tnum ${className}`}>{children}</span>;
}

export function AddrLink({ addr }: { addr: string }) {
  const clean = addr.replace(/^0x0{24}/, "0x");
  return (
    <a
      href={HOODI_ADDR(clean)} target="_blank" rel="noreferrer"
      className="tnum text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {shortAddr(addr)}
    </a>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}
