// Compose and fund a job. Task fixed to the v1 interval-merge challenge; the
// requester sets terms and funds with one wallet tx on L1.

import { useState } from "react";
import { useAccount } from "wagmi";
import { HOODI_TX } from "../lib/format.js";
import { useFundJob, type JobTerms } from "../lib/actions.js";
import { Panel, Mono } from "./ui.js";
import type { Hex } from "viem";

const POLICIES: { id: JobTerms["policy"]; label: string; blurb: string }[] = [
  { id: "cheapest", label: "CHEAPEST", blurb: "lowest price wins" },
  { id: "assured", label: "ASSURED", blurb: "best track record wins" },
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
    try { const hash = await fund(terms); setTx(hash); onFunded(); } catch { /* via error */ }
  }

  return (
    <Panel label="Compose · Fund" meta="L1">
      <div className="space-y-3">
        <div className="border border-border bg-muted/40 px-2.5 py-2">
          <div className="text-[12px] font-medium">Merge overlapping intervals</div>
          <div className="mt-0.5 text-[11px] text-muted-fg">graded by hidden unit tests · unit-tests-v1</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Max price ETH"><NumInput value={terms.maxPriceEth} onChange={(v) => setTerms({ ...terms, maxPriceEth: v })} /></Field>
          <Field label="Escrow ETH"><NumInput value={terms.escrowEth} onChange={(v) => setTerms({ ...terms, escrowEth: v })} /></Field>
          <Field label="Quote win. s"><NumInput value={String(terms.quoteWindowSecs)} onChange={(v) => setTerms({ ...terms, quoteWindowSecs: Number(v) || 0 })} /></Field>
          <Field label="Deadline s"><NumInput value={String(terms.deadlineSecs)} onChange={(v) => setTerms({ ...terms, deadlineSecs: Number(v) || 0 })} /></Field>
        </div>

        <div>
          <FieldLabel>Routing policy</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {POLICIES.map((p) => (
              <button key={p.id} type="button" onClick={() => setTerms({ ...terms, policy: p.id })} aria-pressed={terms.policy === p.id}
                className={`border px-2.5 py-1.5 text-left transition-colors ${terms.policy === p.id ? "border-accent bg-accent/10" : "border-border hover:bg-muted"}`}>
                <div className="text-[11px] font-bold tracking-wide">{p.label}</div>
                <div className="text-[10.5px] text-muted-fg">{p.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={submit} disabled={!isConnected || isPending}
          className="w-full bg-accent px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {!isConnected ? "Connect wallet to fund" : isPending ? "Confirm in wallet…" : `Fund job · ${terms.escrowEth} ETH`}
        </button>

        <p className="text-[10.5px] leading-relaxed text-muted-fg">
          Funding is your one on-chain payment: it carries the escrow, so it rides <span className="text-fg">L1</span> with gas (~12s).
          Everything after (quotes, award, delivery, grading) runs <span className="text-fg">gasless</span> on the injected lane, signed by the operators, not you.
        </p>

        {error && <p className="border border-fail/40 bg-fail/10 px-2.5 py-1.5 text-[11px] text-fail">{(error as { shortMessage?: string }).shortMessage ?? "Transaction failed"}</p>}
        {tx && (
          <p className="text-[11px] text-muted-fg">
            Funded · <a className="text-lane-l1 hover:underline" href={HOODI_TX(tx)} target="_blank" rel="noreferrer"><Mono>{tx.slice(0, 10)}…</Mono></a> · watch the market fill
          </p>
        )}
      </div>
    </Panel>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-fg">{children}</span>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><FieldLabel>{label}</FieldLabel>{children}</label>;
}
function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
    className="tnum w-full border border-border bg-bg px-2 py-1.5 text-[12px] focus-visible:border-accent" />;
}
