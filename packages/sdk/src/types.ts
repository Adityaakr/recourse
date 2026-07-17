// Domain types mirroring the program state, plus SCALE decoders. Field order
// and widths MUST match program/app/src/lib.rs exactly — the decoders read the
// bytes positionally.

import type { Hex } from "./codec.js";
import { ScaleReader } from "./scale.js";

export const STATUS = [
  "Open", "Awarded", "Running", "Delivered", "Verified", "Paid", "Refunded", "Expired",
] as const;
export type Status = (typeof STATUS)[number];

export const VERIFIER_KIND = ["unit-tests-v1", "json-schema-v1"] as const;
export type VerifierKind = (typeof VERIFIER_KIND)[number];

export const POLICY = ["cheapest", "assured"] as const;
export type Policy = (typeof POLICY)[number];

export const OUTCOME = ["Paid", "Refunded"] as const;
export type Outcome = (typeof OUTCOME)[number];

export interface JobSpec {
  requester: Hex;
  escrowWei: bigint;
  maxPriceWei: bigint;
  deadlineSecs: number;
  verifierKind: VerifierKind;
  criteriaHash: Hex;
  policy: Policy;
  quoteWindowSecs: number;
}

export interface Quote {
  provider: Hex;
  priceWei: bigint;
  promisedLatencyMs: number;
  submittedAt: bigint;
}

export interface Receipt {
  outputHash: Hex;
  modelTag: string;
  submittedAt: bigint;
}

export interface Verdict {
  pass: boolean;
  evidenceHash: Hex;
  verifier: Hex;
  submittedAt: bigint;
}

export interface Job {
  id: number;
  spec: JobSpec;
  status: Status;
  createdAt: bigint;
  quotes: Quote[];
  winner: Hex | null;
  awardedAt: bigint | null;
  receipt: Receipt | null;
  verdict: Verdict | null;
  settled: Outcome | null;
  awardReason: string | null;
}

export interface Provider {
  owner: Hex;
  bondWei: bigint;
  jobsWon: number;
  jobsPassed: number;
  jobsFailed: number;
  jobsExpired: number;
  activeJob: number | null;
  registeredAt: bigint;
}

export interface Config {
  verifier: Hex;
  bondWei: bigint;
  slashWei: bigint;
  slashToRequesterBps: number;
}

function readSpec(r: ScaleReader): JobSpec {
  return {
    requester: r.bytes32(),
    escrowWei: r.u128(),
    maxPriceWei: r.u128(),
    deadlineSecs: r.u32(),
    verifierKind: VERIFIER_KIND[r.u8()]!,
    criteriaHash: r.bytes32(),
    policy: POLICY[r.u8()]!,
    quoteWindowSecs: r.u32(),
  };
}

function readQuote(r: ScaleReader): Quote {
  return {
    provider: r.bytes32(),
    priceWei: r.u128(),
    promisedLatencyMs: r.u32(),
    submittedAt: r.u64(),
  };
}

export function decodeJob(r: ScaleReader): Job {
  return {
    id: Number(r.u64()),
    spec: readSpec(r),
    status: STATUS[r.u8()]!,
    createdAt: r.u64(),
    quotes: r.vec(readQuote),
    winner: r.option((rr) => rr.bytes32()),
    awardedAt: r.option((rr) => rr.u64()),
    receipt: r.option((rr) => ({
      outputHash: rr.bytes32(),
      modelTag: rr.string(),
      submittedAt: rr.u64(),
    })),
    verdict: r.option((rr) => ({
      pass: rr.bool(),
      evidenceHash: rr.bytes32(),
      verifier: rr.bytes32(),
      submittedAt: rr.u64(),
    })),
    settled: r.option((rr) => OUTCOME[rr.u8()]!),
    awardReason: r.option((rr) => rr.string()),
  };
}

export function decodeProvider(r: ScaleReader): Provider {
  return {
    owner: r.bytes32(),
    bondWei: r.u128(),
    jobsWon: r.u32(),
    jobsPassed: r.u32(),
    jobsFailed: r.u32(),
    jobsExpired: r.u32(),
    activeJob: r.option((rr) => Number(rr.u64())),
    registeredAt: r.u64(),
  };
}

export function decodeConfig(r: ScaleReader): Config {
  return {
    verifier: r.bytes32(),
    bondWei: r.u128(),
    slashWei: r.u128(),
    slashToRequesterBps: r.u32(),
  };
}
