// Derive a job's "life" from live on-chain state: the ordered steps, who acted,
// the lane each rode, the amounts moved, and the final money split. Everything
// here is computed from real Job + Config fields (nothing invented) so the Live
// view can narrate exactly what happened and settle who-got-what.

import type { Job, Config, TimelineEvent } from "./api.js";

export type StepState = "done" | "active" | "pending";

export interface Step {
  key: string;
  n: number;
  title: string;
  /** One-line description of the concrete action. */
  detail: string;
  /** Actor address (requester/provider/winner/verifier), if any. */
  actor?: string;
  /** Which lane this action rode. */
  lane?: "injected" | "l1" | "settlement";
  state: StepState;
  /** ISO timestamp of when it happened, if known. */
  at?: string;
  /** Client-measured injected latency (ms), if reported. */
  measuredMs?: number;
  /** Provider-promised latency (ms) for the quote step. */
  promisedMs?: number;
  /** Amount in wei this step moved, if any. */
  amountWei?: string;
  /** Model backend tag for the execute step (e.g. "cheapskate:openrouter"). */
  modelTag?: string;
  /** A content hash to surface (output / evidence). */
  hash?: string;
  /** Extra per-quote rows for the quote step. */
  quotes?: { provider: string; priceWei: string; promisedMs: number; won: boolean }[];
}

/** The money split at settlement, computed from escrow, winning price, slash. */
export interface Settlement {
  kind: "paid" | "refunded";
  escrowWei: string;
  /** Winner payout (paid) — the quoted price. */
  paidWei?: string;
  /** Change returned to the requester (paid) — escrow minus price. */
  changeWei?: string;
  /** Total refunded to the requester (refunded/expired) — escrow + slash share. */
  refundWei?: string;
  /** Provider bond slashed (refunded/expired). */
  slashWei?: string;
  /** Requester's share of the slash (part of the refund). */
  slashShareWei?: string;
  winner?: string | null;
  requester: string;
}

const STATUS_ORDER: Record<string, number> = {
  Open: 3, Awarded: 5, Running: 5, Delivered: 6, Verified: 7, Paid: 8, Refunded: 8, Expired: 8,
};

function winnerQuote(job: Job) {
  if (!job.winner) return null;
  const w = job.winner.toLowerCase();
  return job.quotes.find((q) => q.provider.toLowerCase() === w) ?? null;
}

export function computeSettlement(job: Job, config: Config | null): Settlement | null {
  const escrowWei = job.spec.escrowWei;
  const escrow = BigInt(escrowWei);
  if (job.status === "Paid") {
    const price = BigInt(winnerQuote(job)?.priceWei ?? "0");
    return {
      kind: "paid", escrowWei, requester: job.spec.requester, winner: job.winner,
      paidWei: price.toString(), changeWei: (escrow - price).toString(),
    };
  }
  if (job.status === "Refunded" || job.status === "Expired") {
    const slash = config ? BigInt(config.slashWei) : 0n;
    const share = config ? (slash * BigInt(config.slashToRequesterBps)) / 10_000n : 0n;
    return {
      kind: "refunded", escrowWei, requester: job.spec.requester, winner: job.winner,
      refundWei: (escrow + share).toString(), slashWei: slash.toString(), slashShareWei: share.toString(),
    };
  }
  return null;
}

/** Build the ordered lifecycle steps for a job from live state. */
export function buildSteps(job: Job, timeline: TimelineEvent[]): Step[] {
  const ev = (kind: string) => timeline.find((e) => e.jobId === job.id && e.kind === kind);
  const frontier = STATUS_ORDER[job.status] ?? 3;
  const st = (doneWhen: boolean, n: number): StepState =>
    doneWhen ? "done" : frontier === n ? "active" : "pending";

  const wq = winnerQuote(job);
  const steps: Step[] = [];

  steps.push({
    key: "fund", n: 1, title: "Agent funds the job",
    detail: "requester signs a gasless injected call; escrow is debited from their balance",
    actor: job.spec.requester, lane: "injected", state: "done", at: job.createdAt,
    measuredMs: ev("JobCreated")?.measuredMs, amountWei: job.spec.escrowWei,
  });

  steps.push({
    key: "escrow", n: 2, title: "Escrow locked",
    detail: "the program holds the escrow until it settles: pay on pass, refund on fail",
    lane: "settlement", state: "done", amountWei: job.spec.escrowWei,
  });

  steps.push({
    key: "quote", n: 3, title: "Providers quote",
    detail: job.quotes.length ? `${job.quotes.length} bonded providers quoted price + latency` : "waiting for quotes on the injected lane",
    lane: "injected", state: st(job.quotes.length > 0 && frontier > 3, 3),
    quotes: job.quotes.map((q) => ({
      provider: q.provider, priceWei: q.priceWei, promisedMs: q.promisedLatencyMs,
      won: !!job.winner && q.provider.toLowerCase() === job.winner.toLowerCase(),
    })),
  });

  steps.push({
    key: "award", n: 4, title: "Router awards the winner",
    detail: job.awardReason ?? "the program picks deterministically by policy once the window closes",
    actor: job.winner ?? undefined, lane: "injected", state: st(!!job.winner, 4),
    at: job.awardedAt ?? undefined, measuredMs: ev("JobAwarded")?.measuredMs,
    amountWei: wq?.priceWei, promisedMs: wq?.promisedLatencyMs,
  });

  steps.push({
    key: "execute", n: 5, title: "Winner runs the model",
    detail: job.receipt ? "provider executed the task and delivered a signed result" : "winner is solving the task off-chain (real model call)",
    actor: job.winner ?? undefined, lane: "injected", state: st(!!job.receipt, 5),
    at: job.receipt?.submittedAt, measuredMs: ev("ReceiptSubmitted")?.measuredMs,
    modelTag: job.receipt?.modelTag, hash: job.receipt?.outputHash,
  });

  steps.push({
    key: "verify", n: 6, title: "Verifier grades",
    detail: job.verdict
      ? (job.verdict.pass ? "hidden unit tests passed" : "hidden unit tests failed")
      : "the allowlisted verifier runs hidden unit tests",
    actor: job.verdict?.verifier, lane: "injected", state: st(!!job.verdict, 6),
    at: job.verdict?.submittedAt, measuredMs: ev("VerdictSubmitted")?.measuredMs,
    hash: job.verdict?.evidenceHash,
  });

  return steps;
}
