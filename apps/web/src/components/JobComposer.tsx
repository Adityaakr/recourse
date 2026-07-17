// Compose and fund a job. The requester picks a task from the library (each has
// its own hidden test suite the verifier grades against), sets terms, and funds.
// Two lanes are visible right here: "Add funds" is the one classic L1 payment
// (gas) that loads the internal balance; "Fund job" is a gasless injected
// signature that debits it. After one deposit, many jobs fund with no gas.

import { useState } from "react";
import { useAccount } from "wagmi";
import { parseEther } from "viem";
import { TASKS } from "@recourse/tasks";
import { IDEA_PROGRAM, eth } from "../lib/format.js";
import { useDeposit, useFundJob, useInternalBalance, type JobTerms } from "../lib/actions.js";
import { Panel, Mono } from "./ui.js";
import type { Hex } from "viem";

const POLICIES: { id: JobTerms["policy"]; label: string; blurb: string }[] = [
  { id: "cheapest", label: "CHEAPEST", blurb: "lowest price wins" },
  { id: "assured", label: "ASSURED", blurb: "best track record wins" },
];

const TASK_LIST = Object.values(TASKS);

export function JobComposer({ programId, onFunded, className = "" }: { programId: Hex; onFunded: () => void; className?: string }) {
  const { isConnected } = useAccount();
  const { balance, refresh } = useInternalBalance(programId);
  const { deposit, isPending: depositing, error: depositError, reset: resetDeposit } = useDeposit(programId);
  const { fund, isPending: funding, error: fundError, reset: resetFund } = useFundJob(programId);

  const [terms, setTerms] = useState<JobTerms>({
    maxPriceEth: "0.008", escrowEth: "0.01", deadlineSecs: 40, quoteWindowSecs: 24, policy: "cheapest",
    criteriaHash: TASK_LIST[0]!.criteriaHash, verifierKind: TASK_LIST[0]!.verifierKind,
  });
  const selectedTask = TASK_LIST.find((t) => t.criteriaHash === terms.criteriaHash) ?? TASK_LIST[0]!;
  const pickTask = (criteriaHash: string) => {
    const t = TASK_LIST.find((x) => x.criteriaHash === criteriaHash) ?? TASK_LIST[0]!;
    setTerms({ ...terms, criteriaHash: t.criteriaHash, verifierKind: t.verifierKind });
  };
  const [topUp, setTopUp] = useState("0.05");
  const [tx, setTx] = useState<Hex | null>(null);
  const [fundMs, setFundMs] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const escrowWei = safeParseEther(terms.escrowEth);
  const funded = balance !== null && escrowWei !== null && balance >= escrowWei;
  const error = depositError ?? fundError;
  // How many jobs the deposit covers, at the current escrow — makes clear this
  // is a balance top-up, not the per-job price.
  const jobsCovered = (() => {
    const t = Number(topUp), e = Number(terms.escrowEth);
    if (!isFinite(t) || !isFinite(e) || e <= 0 || t <= 0) return null;
    return Math.floor(t / e);
  })();

  async function addFunds() {
    resetDeposit(); resetFund(); setTx(null);
    try {
      const before = balance ?? 0n;
      await deposit(topUp); // classic L1 tx: user confirms in wallet
      // The deposit is an L1 message; the program credits it a block or two
      // after the tx confirms. Poll until the balance rises so we flip to the
      // gasless "Fund job" button instead of leaving the user on "Add funds".
      setConfirming(true);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const b = await refresh();
        if (b !== null && b > before) break;
      }
    } catch {
      /* surfaced via error */
    } finally {
      setConfirming(false);
    }
  }

  async function submit() {
    resetDeposit(); resetFund(); setTx(null); setFundMs(null);
    try {
      const { txHash, ms } = await fund(terms);
      setTx(txHash); setFundMs(ms);
      await refresh();
      onFunded();
    } catch { /* surfaced via error */ }
  }

  return (
    <Panel label="Compose · Fund" meta={funded ? "injected" : "L1 → injected"} className={className}>
      <div className="space-y-3">
        <div>
          <FieldLabel>Task</FieldLabel>
          <select value={terms.criteriaHash} onChange={(e) => pickTask(e.target.value)}
            className="w-full border border-border bg-bg px-2 py-1.5 text-[12px] focus-visible:border-accent">
            {TASK_LIST.map((t) => <option key={t.id} value={t.criteriaHash}>{t.title}</option>)}
          </select>
          <div className="mt-1.5 border border-border bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-muted-fg">{selectedTask.prompt}</p>
            <div className="mt-1 text-[10.5px] text-muted-fg">
              {selectedTask.entry
                ? <>solution exports <Mono className="text-fg">{selectedTask.entry}()</Mono> · graded by hidden unit tests</>
                : <>answer graded against a hidden <Mono className="text-fg">JSON schema</Mono></>}
            </div>
          </div>
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

        {/* Your prepaid balance held in the program */}
        <div className="flex items-center justify-between border border-border px-2.5 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-fg">
            Your balance
            <span className={`text-[10px] uppercase tracking-wide ${funded ? "text-pass" : "text-muted-fg/70"}`}>
              {balance === null ? "" : funded ? "· gasless ready" : "· add funds"}
            </span>
          </span>
          <Mono className={funded ? "text-pass" : "text-fg"}>
            {balance === null ? "--" : `${eth(balance)} ETH`}
          </Mono>
        </div>

        {funded ? (
          <button type="button" onClick={submit} disabled={!isConnected || funding}
            className="w-full bg-accent px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {!isConnected ? "Connect wallet to fund" : funding ? "Sign in wallet…" : `Fund job · ${terms.escrowEth} ETH · gasless`}
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <FieldLabel>Amount to load into your balance</FieldLabel>
              {jobsCovered !== null && (
                <span className="text-[10px] text-muted-fg">funds ~{jobsCovered} job{jobsCovered === 1 ? "" : "s"} at {terms.escrowEth} ETH</span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1"><NumInput value={topUp} onChange={setTopUp} /></div>
              <button type="button" onClick={addFunds} disabled={!isConnected || depositing || confirming}
                className="whitespace-nowrap border border-accent bg-accent/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {!isConnected ? "Connect wallet" : depositing ? "Confirm in wallet…" : confirming ? "Confirming deposit…" : "Add funds · L1 gas"}
              </button>
            </div>
          </div>
        )}

        {error &&<p className="border border-fail/40 bg-fail/10 px-2.5 py-1.5 text-[11px] text-fail">{errText(error)}</p>}
        {tx && (
          <p className="text-[11px] text-muted-fg">
            Funded gasless{fundMs !== null ? ` in ${fundMs}ms` : ""} · <a className="text-lane-injected hover:underline" href={IDEA_PROGRAM(programId)} target="_blank" rel="noreferrer"><Mono>{tx.slice(0, 10)}…</Mono></a> · watch it live on Idea
          </p>
        )}
      </div>
    </Panel>
  );
}

function safeParseEther(v: string): bigint | null {
  try { return parseEther(v as `${number}`); } catch { return null; }
}
function errText(e: Error): string {
  const m = (e as { shortMessage?: string }).shortMessage ?? e.message ?? "Transaction failed";
  return m.length > 160 ? `${m.slice(0, 157)}…` : m;
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
