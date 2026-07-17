// Read model: fetch the indexer's view of live hoodi state and subscribe to
// its event stream. All data here originates on-chain — the indexer only
// decodes and relays it.

import { useEffect, useRef, useState } from "react";

const INDEXER = import.meta.env.VITE_INDEXER_URL ?? "http://localhost:8787";

export type Status =
  | "Open" | "Awarded" | "Running" | "Delivered" | "Verified" | "Paid" | "Refunded" | "Expired";

export interface Quote {
  provider: string;
  priceWei: string;
  promisedLatencyMs: number;
  submittedAt: string;
}

export interface Job {
  id: number;
  spec: {
    requester: string;
    escrowWei: string;
    maxPriceWei: string;
    deadlineSecs: number;
    verifierKind: string;
    criteriaHash: string;
    policy: "cheapest" | "assured";
    quoteWindowSecs: number;
  };
  status: Status;
  createdAt: string;
  quotes: Quote[];
  winner: string | null;
  awardedAt: string | null;
  receipt: { outputHash: string; modelTag: string; submittedAt: string } | null;
  verdict: { pass: boolean; evidenceHash: string; verifier: string; submittedAt: string } | null;
  settled: "Paid" | "Refunded" | null;
  awardReason: string | null;
}

export interface Config {
  verifier: string;
  bondWei: string;
  slashWei: string;
  slashToRequesterBps: number;
}

export interface Deployment {
  programId: string;
  router: string;
  wvara: string;
  verifier: string;
}

export type Lane = "injected" | "l1" | "settlement";

export interface TimelineEvent {
  seq: number;
  jobId: number;
  kind: string;
  lane: Lane;
  at: string;
  detail: Record<string, unknown>;
  measuredMs?: number;
}

export interface State {
  deployment: Deployment;
  config: Config | null;
  jobs: Job[];
  timeline: TimelineEvent[];
}

export type Conn = "connecting" | "live" | "error";

/** Live state: initial fetch + SSE stream, with a poll fallback. */
export function useIndexer() {
  const [state, setState] = useState<State | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const stateRef = useRef<State | null>(null);
  stateRef.current = state;

  async function refetch() {
    try {
      const res = await fetch(`${INDEXER}/api/state`);
      if (!res.ok) throw new Error(String(res.status));
      setState(await res.json());
      setConn("live");
    } catch {
      setConn("error");
    }
  }

  useEffect(() => {
    refetch();
    const es = new EventSource(`${INDEXER}/api/stream`);
    es.addEventListener("hello", () => setConn("live"));
    es.addEventListener("timeline", () => refetch()); // new event -> pull fresh state
    es.onerror = () => setConn("error");
    const poll = setInterval(refetch, 5000); // fallback / catch-up
    return () => { es.close(); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, conn, refetch };
}

export { INDEXER };
