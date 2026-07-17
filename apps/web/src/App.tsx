import { useEffect, useMemo, useState } from "react";
import { useIndexer, type Job } from "./lib/api.js";
import { Sidebar, type View } from "./components/Sidebar.js";
import { Hero } from "./components/Hero.js";
import { JobComposer } from "./components/JobComposer.js";
import { ProviderMarket } from "./components/ProviderMarket.js";
import { ExecutionTrace } from "./components/ExecutionTrace.js";
import { SettlementReceipt } from "./components/SettlementReceipt.js";
import { StatusPill, Mono, Skeleton, Panel, AddrLink } from "./components/ui.js";
import { eth } from "./lib/format.js";
import type { Hex } from "viem";

export function App() {
  const { state, conn } = useIndexer();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const jobs = state?.jobs ?? [];
  useEffect(() => {
    if (selected === null && jobs.length) setSelected(jobs[jobs.length - 1]!.id);
  }, [jobs, selected]);

  const job = useMemo(() => jobs.find((j) => j.id === selected) ?? null, [jobs, selected]);
  const programId = (state?.deployment.programId ?? "0x") as Hex;

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      <Sidebar
        view={view} onView={setView} programId={programId} conn={conn}
        theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-sidebar px-8 py-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight capitalize">{view}</h1>
            <p className="text-sm text-muted-fg">
              {view === "dashboard" && "Fund a job and watch the protocol route, grade, and settle it."}
              {view === "jobs" && "Every job routed through the program, newest first."}
              {view === "providers" && "Bonded providers and how they've performed."}
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs sm:flex">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lane-injected" /> injected</span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lane-l1" /> L1</span>
          </div>
        </header>

        <main className="thin-scroll flex-1 overflow-y-auto p-8">
          {!state ? (
            <div className="space-y-4"><Skeleton className="h-56" /><div className="grid gap-4 sm:grid-cols-4">{[0,1,2,3].map(i=><Skeleton key={i} className="h-20" />)}</div></div>
          ) : view === "dashboard" ? (
            <div className="space-y-6">
              <Hero jobs={jobs} timeline={state.timeline} />
              <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
                <div className="flex flex-col gap-5">
                  <JobComposer programId={programId} onFunded={() => {}} />
                  <JobList jobs={jobs} selected={selected} onSelect={setSelected} compact />
                </div>
                <div className="grid min-h-0 gap-5 xl:grid-cols-2">
                  <div className="xl:row-span-2"><ProviderMarket job={job} timeline={state.timeline} /></div>
                  <ExecutionTrace job={job} timeline={state.timeline} />
                  <SettlementReceipt job={job} config={state.config} />
                </div>
              </div>
            </div>
          ) : view === "jobs" ? (
            <JobsTable jobs={jobs} onSelect={(id) => { setSelected(id); setView("dashboard"); }} />
          ) : (
            <ProvidersTable jobs={jobs} />
          )}
        </main>

        <footer className="border-t bg-sidebar px-8 py-3 text-xs text-muted-fg">
          {state && (
            <span>Program <a className="text-lane-l1 hover:underline" href={`https://hoodi.etherscan.io/address/${programId}`} target="_blank" rel="noreferrer"><Mono>{programId.slice(0, 10)}…</Mono></a> on hoodi · live on-chain data, nothing simulated</span>
          )}
        </footer>
      </div>
    </div>
  );
}

function JobList({ jobs, selected, onSelect, compact }: { jobs: Job[]; selected: number | null; onSelect: (id: number) => void; compact?: boolean }) {
  return (
    <Panel title="Jobs" hint={`${jobs.length} routed`} className={compact ? "max-h-[360px]" : ""}>
      {jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-fg">No jobs yet. Fund one to begin.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...jobs].reverse().map((j) => (
            <li key={j.id}>
              <button type="button" onClick={() => onSelect(j.id)} aria-pressed={selected === j.id}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${selected === j.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                <span className="flex items-center gap-2"><Mono className="text-sm font-medium">#{j.id}</Mono><span className="text-xs text-muted-fg">{j.spec.policy}</span></span>
                <StatusPill status={j.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function JobsTable({ jobs, onSelect }: { jobs: Job[]; onSelect: (id: number) => void }) {
  return (
    <Panel title="All jobs" hint={`${jobs.length} routed on hoodi`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-fg">
            <Th>Job</Th><Th>Policy</Th><Th>Escrow</Th><Th>Winner</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {[...jobs].reverse().map((j) => (
              <tr key={j.id} onClick={() => onSelect(j.id)} className="cursor-pointer border-b last:border-0 hover:bg-muted">
                <td className="py-2.5"><Mono className="font-medium">#{j.id}</Mono></td>
                <td className="capitalize">{j.spec.policy}</td>
                <td><Mono>{eth(j.spec.escrowWei)} ETH</Mono></td>
                <td>{j.winner ? <AddrLink addr={j.winner} /> : <span className="text-muted-fg">—</span>}</td>
                <td><StatusPill status={j.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ProvidersTable({ jobs }: { jobs: Job[] }) {
  const stats = new Map<string, { won: number; paid: number; failed: number }>();
  for (const j of jobs) {
    for (const q of j.quotes) {
      const k = q.provider.toLowerCase();
      if (!stats.has(k)) stats.set(k, { won: 0, paid: 0, failed: 0 });
    }
    if (j.winner) {
      const k = j.winner.toLowerCase();
      const s = stats.get(k) ?? { won: 0, paid: 0, failed: 0 };
      s.won++;
      if (j.status === "Paid") s.paid++;
      if (j.status === "Refunded" || j.status === "Expired") s.failed++;
      stats.set(k, s);
    }
  }
  const rows = [...stats.entries()];
  return (
    <Panel title="Providers" hint={`${rows.length} seen in the market`}>
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-fg">No providers have quoted yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-fg"><Th>Provider</Th><Th>Won</Th><Th>Passed</Th><Th>Failed</Th></tr></thead>
            <tbody>
              {rows.map(([addr, s]) => (
                <tr key={addr} className="border-b last:border-0">
                  <td className="py-2.5"><AddrLink addr={addr} /></td>
                  <td><Mono>{s.won}</Mono></td>
                  <td><Mono className="text-pass">{s.paid}</Mono></td>
                  <td><Mono className="text-fail">{s.failed}</Mono></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 pr-4 font-medium">{children}</th>;
}
