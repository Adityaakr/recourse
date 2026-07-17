// Panel 3 — the execution trace. A live timeline of the job crossing lanes:
// award and delivery ride the injected lane, funding rode L1, settlement moves
// value back to L1. Each step shows the lane it took.

import type { Job, TimelineEvent } from "../lib/api.js";
import { Panel, Mono, Empty, LaneBadge } from "./ui.js";
import { Activity } from "lucide-react";
import { ms } from "../lib/format.js";

const KIND_LABEL: Record<string, string> = {
  JobCreated: "Job funded",
  QuoteSubmitted: "Quote received",
  JobAwarded: "Awarded to winner",
  ReceiptSubmitted: "Result delivered",
  VerdictSubmitted: "Verdict signed",
  JobSettled: "Settled",
  JobExpired: "Deadline expired",
};

export function ExecutionTrace({ job, timeline }: { job: Job | null; timeline: TimelineEvent[] }) {
  if (!job) return <Panel title="Execution trace" icon={<Activity size={16} />} tone="l1"><Empty>The step-by-step trace appears once a job is live.</Empty></Panel>;

  const events = timeline.filter((e) => e.jobId === job.id).sort((a, b) => a.seq - b.seq);

  return (
    <Panel title="Execution trace" hint={`Job #${job.id} · ${events.length} steps`} icon={<Activity size={16} />} tone="l1">
      {events.length === 0 ? (
        <Empty>Awaiting the first event…</Empty>
      ) : (
        <ol className="relative space-y-4 pl-6">
          <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" aria-hidden />
          {events.map((e) => (
            <li key={e.seq} className="animate-rise relative">
              <span
                className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background ${
                  e.lane === "injected" ? "bg-lane-injected" : e.lane === "l1" ? "bg-lane-l1" : "bg-muted-fg"
                }`}
                aria-hidden
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                <LaneBadge lane={e.lane} />
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-fg">
                <TimeAgo iso={e.at} />
                {e.measuredMs !== undefined && (
                  <span className="text-lane-injected">signed in <Mono>{ms(e.measuredMs)}</Mono> ✓</span>
                )}
                {e.kind === "VerdictSubmitted" && (
                  <span className={e.detail.pass ? "text-pass" : "text-fail"}>
                    {e.detail.pass ? "tests passed" : "tests failed"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function TimeAgo({ iso }: { iso: string }) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const label = secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  return <span>{label}</span>;
}
