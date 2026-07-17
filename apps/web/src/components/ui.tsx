// Light-system UI primitives. Soft white cards, colored icon badges, tokened
// colors, monospaced on-chain numbers, the two lanes color-coded.

import type { ReactNode } from "react";
import type { Status, Lane } from "../lib/api.js";
import { HOODI_ADDR, shortAddr } from "../lib/format.js";

type Tone = "primary" | "injected" | "l1" | "pass" | "fail" | "pending" | "neutral";

const TONE_BG: Record<Tone, string> = {
  primary: "bg-primary text-white",
  injected: "bg-lane-injected text-white",
  l1: "bg-lane-l1 text-white",
  pass: "bg-pass text-white",
  fail: "bg-fail text-white",
  pending: "bg-pending text-white",
  neutral: "bg-muted text-muted-fg",
};

/** The rounded-square icon badge — the signature accent, one per panel/stat. */
export function IconBadge({ tone = "primary", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] shadow-card ${TONE_BG[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ title, hint, icon, tone, right, children, className = "" }: {
  title: string; hint?: string; icon?: ReactNode; tone?: Tone; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-2xl border bg-card shadow-card ${className}`}>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          {icon && <IconBadge tone={tone}>{icon}</IconBadge>}
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-fg">{hint}</p>}
          </div>
        </div>
        {right}
      </header>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  Open: "text-muted-fg bg-muted",
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const LANE_META: Record<Lane, { label: string; cls: string }> = {
  injected: { label: "injected", cls: "text-lane-injected bg-lane-injected/10" },
  l1: { label: "L1", cls: "text-lane-l1 bg-lane-l1/10" },
  settlement: { label: "settle", cls: "text-muted-fg bg-muted" },
};

export function LaneBadge({ lane }: { lane: Lane }) {
  const m = LANE_META[lane];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>
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
    <a href={HOODI_ADDR(clean)} target="_blank" rel="noreferrer"
      className="tnum text-muted-fg underline-offset-2 hover:text-fg hover:underline">
      {shortAddr(addr)}
    </a>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-6 text-center text-sm text-muted-fg">
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}
