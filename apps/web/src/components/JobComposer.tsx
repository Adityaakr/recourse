// Panel 1 — compose and fund a job. Task is fixed to the v1 interval-merge
// coding challenge; the requester sets the terms and funds with one wallet tx.

import { useState } from "react";
import { useAccount } from "wagmi";
import { HOODI_TX } from "../lib/format.js";
import { useFundJob, type JobTerms } from "../lib/actions.js";
import { Panel, Mono } from "./ui.js";
import type { Hex } from "viem";

const POLICIES: { id: JobTerms["policy"]; label: string; blurb: string }[] = [
  { id: "cheapest", label: "Cheapest", blurb: "Lowest price wins" },
  { id: "assured", label: "Assured", blurb: "Best track record wins" },
];

export function JobComposer({ programId, onFunded }: { programId: Hex; onFunded: () => void }) {
  const { isConnected } = useAccount();
  const { fund, isPending, error, reset } = useFundJob(programId);
  const [terms, setTerms] = useState<JobTerms>({
    maxPriceEth: "0.008", escrowEth: "0.01", deadlineSecs: 40, quoteWindowSecs: 24, policy: "cheapest",
  });
  const [tx, setTx] = useState<Hex | null>(null);

  async function submit() {
    reset(); setTx(null);
    try {
      const hash = await fund(terms);
      setTx(hash);
      onFunded();
    } catch { /* surfaced via `error` */ }
  }

  return (
    <Panel title="Job composer" hint="Interval-merge coding task · funded on L1">
      <div className="space-y-4">
        <Field label="Task">
          <div className="rounded-lg border bg-muted/50 px-3 py-2.5">
            <div className="text-sm font-medium">Merge overlapping intervals</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Graded by hidden unit tests · unit-tests-v1</div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max price (ETH)">
            <NumInput value={terms.maxPriceEth} onChange={(v) => setTerms({ ...terms, maxPriceEth: v })} />
          </Field>
          <Field label="Escrow (ETH)">
            <NumInput value={terms.escrowEth} onChange={(v) => setTerms({ ...terms, escrowEth: v })} />
          </Field>
          <Field label="Quote window (s)">
            <NumInput value={String(terms.quoteWindowSecs)} onChange={(v) => setTerms({ ...terms, quoteWindowSecs: Number(v) || 0 })} />
          </Field>
          <Field label="Deadline (s)">
            <NumInput value={String(terms.deadlineSecs)} onChange={(v) => setTerms({ ...terms, deadlineSecs: Number(v) || 0 })} />
          </Field>
        </div>

        <Field label="Routing policy">
          <div className="grid grid-cols-2 gap-2">
            {POLICIES.map((p) => (
              <button
                key={p.id} type="button" onClick={() => setTerms({ ...terms, policy: p.id })}
                aria-pressed={terms.policy === p.id}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  terms.policy === p.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.blurb}</div>
              </button>
            ))}
          </div>
        </Field>

        <button
          type="button" onClick={submit} disabled={!isConnected || isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!isConnected ? "Connect wallet to fund" : isPending ? "Confirm in wallet…" : `Fund job · ${terms.escrowEth} ETH`}
        </button>

        {error && (
          <p className="rounded-lg bg-fail/10 px-3 py-2 text-xs text-fail">
            {(error as { shortMessage?: string }).shortMessage ?? "Transaction failed"}
          </p>
        )}
        {tx && (
          <p className="text-xs text-muted-foreground">
            Funded — <a className="text-lane-l1 hover:underline" href={HOODI_TX(tx)} target="_blank" rel="noreferrer">
              <Mono>{tx.slice(0, 10)}…</Mono>
            </a> on L1. Watch the market fill →
          </p>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
      className="tnum w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-primary"
    />
  );
}
