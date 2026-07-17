// Terminal UI primitives. Boxy windowed panels with an amber label bar, sharp
// thin borders, monospaced data, the two lanes color-coded.

import { useState, type ReactNode } from "react";
import type { Status, Lane } from "../lib/api.js";
import { shortAddr } from "../lib/format.js";

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

// Monochrome status: settled-good is a solid inverted chip (prominent),
// failure/terminal-bad is a strong outline, in-flight is muted. Distinguished
// by fill vs outline, not colour.
const STATUS_STYLE: Record<Status, string> = {
  Open: "border border-border text-muted-fg",
  Awarded: "border border-fg/30 text-fg",
  Running: "border border-fg/30 text-fg",
  Delivered: "border border-fg/40 text-fg",
  Verified: "border border-fg/40 text-fg",
  Paid: "bg-fg text-bg border border-fg",
  Refunded: "border border-fg text-fg",
  Expired: "border border-fg text-fg",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

// Lanes are shade + treatment: injected is a filled chip, L1 an outlined one.
export function LaneBadge({ lane }: { lane: Lane }) {
  if (lane === "injected") return <span className="inline-flex items-center gap-1 bg-fg px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-bg">inj</span>;
  if (lane === "l1") return <span className="inline-flex items-center gap-1 border border-fg/60 px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-fg"><span className="h-1 w-1 rounded-full border border-current" />L1</span>;
  return <span className="inline-flex items-center gap-1 border border-border px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-muted-fg">set</span>;
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tnum ${className}`}>{children}</span>;
}

/** An account address. Idea is program-centric (no per-account page), so rather
 *  than send every address to the same program URL, this copies the full
 *  address on click — a precise, useful action instead of a misleading link. */
export function AddrLink({ addr }: { addr: string }) {
  const clean = addr.replace(/^0x0{24}/, "0x");
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" title={`${clean} · click to copy`}
      onClick={() => { navigator.clipboard?.writeText(clean).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
      className="tnum text-lane-injected underline-offset-2 hover:underline">
      {copied ? "copied ✓" : shortAddr(addr)}
    </button>
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
