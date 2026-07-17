// The execution trace. A live timeline of the job crossing lanes: funding rode
// L1, award and delivery ride the injected lane, settlement returns value to L1.

import type { Job, TimelineEvent } from "../lib/api.js";
import { Panel, Mono, Empty, LaneBadge } from "./ui.js";
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
  if (!job) return <Panel label="Execution trace"><Empty>The step-by-step trace appears once a job is live.</Empty></Panel>;
  const events = timeline.filter((e) => e.jobId === job.id).sort((a, b) => a.seq - b.seq);

  return (
    <Panel label="Execution trace" meta={`#${job.id} · ${events.length} steps`}>
      {events.length === 0 ? (
        <Empty>Awaiting the first event…</Empty>
      ) : (
        <ol className="relative space-y-2.5 pl-5">
          <span className="absolute left-[5px] top-1 bottom-1 w-px bg-border" aria-hidden />
          {events.map((e) => (
            <li key={e.seq} className="animate-rise relative">
              <span className={`absolute -left-5 top-1 h-2.5 w-2.5 border border-bg ${e.lane === "injected" ? "bg-lane-injected" : e.lane === "l1" ? "bg-lane-l1" : "bg-muted-fg"}`} aria-hidden />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                <LaneBadge lane={e.lane} />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-fg">
                <TimeAgo iso={e.at} />
                {e.measuredMs !== undefined && <span className="text-lane-injected">signed <Mono>{ms(e.measuredMs)}</Mono>{"✓"}</span>}
                {e.kind === "VerdictSubmitted" && <span className={e.detail.pass ? "text-pass" : "text-fail"}>{e.detail.pass ? "tests passed" : "tests failed"}</span>}
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
  return <span>{secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`}</span>;
}
