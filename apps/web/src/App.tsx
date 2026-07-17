import { useEffect, useMemo, useState } from "react";
import { useIndexer } from "./lib/api.js";
import { Header } from "./components/Header.js";
import { JobComposer } from "./components/JobComposer.js";
import { ProviderMarket } from "./components/ProviderMarket.js";
import { ExecutionTrace } from "./components/ExecutionTrace.js";
import { SettlementReceipt } from "./components/SettlementReceipt.js";
import { StatusPill, Mono, Skeleton } from "./components/ui.js";
import type { Hex } from "viem";

export function App() {
  const { state, conn } = useIndexer();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // Default the selection to the newest job as jobs arrive.
  const jobs = state?.jobs ?? [];
  useEffect(() => {
    if (selected === null && jobs.length) setSelected(jobs[jobs.length - 1]!.id);
  }, [jobs, selected]);

  const job = useMemo(() => jobs.find((j) => j.id === selected) ?? null, [jobs, selected]);
  const programId = (state?.deployment.programId ?? "0x") as Hex;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col">
      <Header conn={conn} theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[380px_1fr] lg:p-6">
        {/* Left rail: compose + pick a job */}
        <div className="flex min-h-0 flex-col gap-4">
          {state ? (
            <JobComposer programId={programId} onFunded={() => {}} />
          ) : (
            <Skeleton className="h-80" />
          )}
          <JobList jobs={jobs} selected={selected} onSelect={setSelected} loading={!state} />
        </div>

        {/* Right: the three live panels for the selected job */}
        <div className="grid min-h-0 gap-4 xl:grid-cols-2">
          <div className="xl:row-span-2"><ProviderMarket job={job} timeline={state?.timeline ?? []} /></div>
          <ExecutionTrace job={job} timeline={state?.timeline ?? []} />
          <SettlementReceipt job={job} config={state?.config ?? null} />
        </div>
      </main>

      <footer className="border-t px-6 py-3 text-xs text-muted-foreground">
        {state ? (
          <span>
            Program <a className="text-lane-l1 hover:underline" href={`https://hoodi.etherscan.io/address/${programId}`} target="_blank" rel="noreferrer"><Mono>{programId.slice(0, 10)}…</Mono></a> on hoodi ·
            live on-chain data, nothing simulated
          </span>
        ) : "Connecting to the indexer…"}
      </footer>
    </div>
  );
}

function JobList({ jobs, selected, onSelect, loading }: {
  jobs: import("./lib/api.js").Job[]; selected: number | null; onSelect: (id: number) => void; loading: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card">
      <header className="border-b px-5 py-3.5"><h2 className="text-[15px] font-semibold tracking-tight">Jobs</h2></header>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : jobs.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">No jobs yet. Fund one above to begin.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...jobs].reverse().map((j) => (
              <li key={j.id}>
                <button
                  type="button" onClick={() => onSelect(j.id)} aria-pressed={selected === j.id}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selected === j.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Mono className="text-sm">#{j.id}</Mono>
                    <span className="text-xs text-muted-foreground">{j.spec.policy}</span>
                  </span>
                  <StatusPill status={j.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
