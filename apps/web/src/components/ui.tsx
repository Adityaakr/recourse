// Terminal UI primitives. Boxy windowed panels with an amber label bar, sharp
// thin borders, monospaced data, the two lanes color-coded.

import type { ReactNode } from "react";
import type { Status, Lane } from "../lib/api.js";
import { HOODI_ADDR, shortAddr } from "../lib/format.js";

export function Panel({ label, meta, right, children, className = "", bodyClass = "" }: {
  label: string; meta?: string; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col border bg-card ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b bg-card-head px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="term-label truncate">{label}</span>
          {meta && <span className="truncate text-[11px] text-muted-fg">{meta}</span>}
        </div>
        {right}
      </header>
      <div className={`thin-scroll min-h-0 flex-1 overflow-y-auto p-3 ${bodyClass}`}>{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  Open: "text-muted-fg border-border",
  Awarded: "text-pending border-pending/40",
  Running: "text-pending border-pending/40",
  Delivered: "text-lane-injected border-lane-injected/40",
  Verified: "text-lane-injected border-lane-injected/40",
  Paid: "text-pass border-pass/40",
  Refunded: "text-fail border-fail/40",
  Expired: "text-fail border-fail/40",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const LANE_META: Record<Lane, { label: string; cls: string }> = {
  injected: { label: "INJ", cls: "text-lane-injected border-lane-injected/40" },
  l1: { label: "L1", cls: "text-lane-l1 border-lane-l1/40" },
  settlement: { label: "SET", cls: "text-muted-fg border-border" },
};

export function LaneBadge({ lane }: { lane: Lane }) {
  const m = LANE_META[lane];
  return (
    <span className={`inline-flex items-center gap-1 border px-1 py-px text-[9.5px] font-bold uppercase tracking-wider ${m.cls}`}>
      <span className="h-1 w-1 bg-current" />{m.label}
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tnum ${className}`}>{children}</span>;
}

export function AddrLink({ addr }: { addr: string }) {
  const clean = addr.replace(/^0x0{24}/, "0x");
  return (
    <a href={HOODI_ADDR(clean)} target="_blank" rel="noreferrer"
      className="tnum text-lane-injected underline-offset-2 hover:underline">
      {shortAddr(addr)}
    </a>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[100px] items-center justify-center px-6 text-center text-xs text-muted-fg">
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted ${className}`} />;
}

/** A key/value data row, terminal-style. */
export function KV({ k, children, tone }: { k: string; children: ReactNode; tone?: "pass" | "fail" | "muted" }) {
  const t = tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : "";
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-fg">{k}</span>
      <span className={`tnum text-[12px] font-medium ${t}`}>{children}</span>
    </div>
  );
}
