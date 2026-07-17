import { useEffect, useMemo, useState } from "react";
import { useIndexer, type Job } from "./lib/api.js";
import { Sidebar, type View } from "./components/Sidebar.js";
import { Hero } from "./components/Hero.js";
import { JobComposer } from "./components/JobComposer.js";
import { ProviderMarket } from "./components/ProviderMarket.js";
import { ExecutionTrace } from "./components/ExecutionTrace.js";
import { SettlementReceipt } from "./components/SettlementReceipt.js";
import { Analytics } from "./components/Analytics.js";
import { Dialog } from "./components/Dialog.js";
import { JobDetail } from "./components/JobDetail.js";
import { StatusPill, Mono, Skeleton, Panel, AddrLink } from "./components/ui.js";
import { eth } from "./lib/format.js";
import { Maximize2 } from "lucide-react";
import type { Hex } from "viem";

export function App() {
  const { state, conn } = useIndexer();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  // Follow the newest job by default so a fresh fund is watched live; pinning a
  // job manually stops the follow until the next fund.
  const [followLatest, setFollowLatest] = useState(true);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  const jobs = state?.jobs ?? [];
  const latestId = jobs.length ? jobs[jobs.length - 1].id : null;
  useEffect(() => { if (followLatest && latestId !== null) setSelected(latestId); }, [followLatest, latestId]);
  function pickJob(id: number) { setFollowLatest(false); setSelected(id); }
  const job = useMemo(() => jobs.find((j) => j.id === selected) ?? null, [jobs, selected]);
  const detailJob = useMemo(() => jobs.find((j) => j.id === detail) ?? null, [jobs, detail]);
  const programId = (state?.deployment.programId ?? "0x") as Hex;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar view={view} onView={setView} programId={programId} conn={conn}
        theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-sidebar px-4 py-2.5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="term-label text-[12px]" style={{ letterSpacing: "0.08em" }}>{view}</h1>
            <span className="text-[11px] text-muted-fg">
              {view === "dashboard" && "fund a job; watch the protocol route, grade, and settle it"}
              {view === "jobs" && "every job routed through the program, newest first"}
              {view === "providers" && "bonded providers and how they have performed"}
              {view === "analytics" && "live charts over routed jobs, latency, and settlement"}
            </span>
          </div>
          <div className="flex items-center gap-2 border border-border px-2 py-1 text-[10px] uppercase tracking-wide">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 bg-lane-injected" /> inj</span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 bg-lane-l1" /> L1</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden p-2.5">
          {!state ? (
            <div className="grid h-full grid-rows-[auto_1fr] gap-2.5">
              <Skeleton className="h-[72px]" />
              <div className="grid grid-cols-[300px_1fr_320px] gap-2.5"><Skeleton /><Skeleton /><Skeleton /></div>
            </div>
          ) : view === "dashboard" ? (
            <div className="flex h-full flex-col gap-2.5">
              <Hero jobs={jobs} timeline={state.timeline} />
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[300px_1fr_320px]">
                <div className="flex min-h-0 flex-col gap-2.5">
                  <JobComposer programId={programId} onFunded={() => setFollowLatest(true)} />
                  <JobList jobs={jobs} selected={selected} following={followLatest} onSelect={pickJob} onDetail={setDetail} className="min-h-0 flex-1" />
                </div>
                <ProviderMarket job={job} timeline={state.timeline} />
                <div className="flex min-h-0 flex-col gap-2.5">
                  <ExecutionTrace job={job} timeline={state.timeline} />
                  <SettlementReceipt job={job} config={state.config} />
                </div>
              </div>
            </div>
          ) : view === "analytics" ? (
            <Analytics jobs={jobs} timeline={state.timeline} />
          ) : view === "jobs" ? (
            <div className="h-full"><JobsTable jobs={jobs} onSelect={setDetail} /></div>
          ) : (
            <div className="h-full"><ProvidersTable jobs={jobs} /></div>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t bg-sidebar px-4 py-1.5 text-[10.5px] text-muted-fg">
          <span className={`flex items-center gap-1.5 ${conn === "live" ? "text-pass" : conn === "error" ? "text-fail" : "text-pending"}`}>
            <span className="h-1.5 w-1.5 bg-current" />{conn === "live" ? "LIVE" : conn === "error" ? "OFFLINE" : "SYNC"}
          </span>
          {state && <span>PROGRAM <a className="text-lane-injected hover:underline" href={`https://hoodi.etherscan.io/address/${programId}`} target="_blank" rel="noreferrer"><Mono>{programId.slice(0, 12)}…</Mono></a></span>}
          <span className="ml-auto">hoodi 560048 · live on-chain data, nothing simulated</span>
        </footer>
      </div>

      <Dialog open={detail !== null} onClose={() => setDetail(null)} label="Job detail" meta={detailJob ? `#${detailJob.id}` : undefined}>
        {detailJob && <JobDetail job={detailJob} config={state?.config ?? null} />}
      </Dialog>
    </div>
  );
}

function JobList({ jobs, selected, following, onSelect, onDetail, className = "" }: { jobs: Job[]; selected: number | null; following?: boolean; onSelect: (id: number) => void; onDetail: (id: number) => void; className?: string }) {
  return (
    <Panel label="Jobs" meta={`${jobs.length} routed`} right={following ? <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-fg"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg" />following live</span> : undefined} className={className}>
      {jobs.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted-fg">No jobs yet. Fund one to begin.</p>
      ) : (
        <div className="border border-border">
          {[...jobs].reverse().map((j) => (
            <div key={j.id} onClick={() => onSelect(j.id)}
              className={`group flex w-full cursor-pointer items-center justify-between border-b border-border/60 px-2.5 py-2 text-left transition-colors last:border-0 ${selected === j.id ? "bg-accent/10" : "hover:bg-muted"}`}>
              <span className="flex items-center gap-2.5"><Mono className={`text-[12px] font-semibold ${selected === j.id ? "text-accent" : ""}`}>#{j.id}</Mono><span className="text-[11px] uppercase tracking-wide text-muted-fg">{j.spec.policy}</span></span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); onDetail(j.id); }} aria-label={`Open job ${j.id} detail`}
                  className="text-muted-fg opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"><Maximize2 size={12} /></button>
                <StatusPill status={j.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function JobsTable({ jobs, onSelect }: { jobs: Job[]; onSelect: (id: number) => void }) {
  return (
    <Panel label="All jobs" meta={`${jobs.length} routed on hoodi`} className="h-full">
      <table className="w-full text-[12px]">
        <thead><tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-fg">
          <Th>Job</Th><Th>Policy</Th><Th>Escrow</Th><Th>Winner</Th><Th>Status</Th>
        </tr></thead>
        <tbody>
          {[...jobs].reverse().map((j) => (
            <tr key={j.id} onClick={() => onSelect(j.id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted">
              <td className="py-2"><Mono className="font-semibold">#{j.id}</Mono></td>
              <td className="uppercase tracking-wide text-muted-fg">{j.spec.policy}</td>
              <td><Mono>{eth(j.spec.escrowWei)} ETH</Mono></td>
              <td>{j.winner ? <AddrLink addr={j.winner} /> : <span className="text-muted-fg">--</span>}</td>
              <td><StatusPill status={j.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function ProvidersTable({ jobs }: { jobs: Job[] }) {
  const stats = new Map<string, { won: number; paid: number; failed: number }>();
  for (const j of jobs) {
    for (const q of j.quotes) { const k = q.provider.toLowerCase(); if (!stats.has(k)) stats.set(k, { won: 0, paid: 0, failed: 0 }); }
    if (j.winner) {
      const k = j.winner.toLowerCase();
      const s = stats.get(k) ?? { won: 0, paid: 0, failed: 0 };
      s.won++; if (j.status === "Paid") s.paid++; if (j.status === "Refunded" || j.status === "Expired") s.failed++;
      stats.set(k, s);
    }
  }
  const rows = [...stats.entries()];
  return (
    <Panel label="Providers" meta={`${rows.length} seen`} className="h-full">
      {rows.length === 0 ? <p className="py-6 text-center text-[11px] text-muted-fg">No providers have quoted yet.</p> : (
        <table className="w-full text-[12px]">
          <thead><tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-fg"><Th>Provider</Th><Th>Won</Th><Th>Passed</Th><Th>Failed</Th></tr></thead>
          <tbody>
            {rows.map(([addr, s]) => (
              <tr key={addr} className="border-b border-border/60 last:border-0">
                <td className="py-2"><AddrLink addr={addr} /></td>
                <td><Mono>{s.won}</Mono></td><td><Mono className="text-pass">{s.paid}</Mono></td><td><Mono className="text-fail">{s.failed}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="pb-2 pr-4 font-semibold">{children}</th>; }
