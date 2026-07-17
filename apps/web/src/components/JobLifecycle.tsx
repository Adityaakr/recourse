// The Live view: a job's whole life, in real time. Each step lights up as it
// happens on hoodi, showing the concrete action, who did it (linked to the Idea
// explorer), the lane it rode, the measured latency, the model that ran, and —
// at settlement — exactly who got paid or refunded how much. All values are
// derived from live on-chain state (see lib/lifecycle.ts); nothing is invented.

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { taskByCriteria, type Task } from "@recourse/tasks";
import type { Job, Config, TimelineEvent } from "../lib/api.js";
import { INDEXER } from "../lib/api.js";
import { buildSteps, computeSettlement, type Step } from "../lib/lifecycle.js";
import { eth, ms, IDEA_PROGRAM } from "../lib/format.js";
import { Panel, Mono, Empty, LaneBadge, StatusPill, AddrLink } from "./ui.js";
import type { Hex } from "viem";

export function JobLifecycle({ job, config, timeline, programId }: {
  job: Job | null; config: Config | null; timeline: TimelineEvent[]; programId: Hex;
}) {
  if (!job) {
    return <Panel label="Live" className="h-full"><Empty>Fund a job to watch its whole life unfold here in real time: quotes, the winning route, the model call, grading, and who gets paid.</Empty></Panel>;
  }
  const steps = buildSteps(job, timeline);
  const settlement = computeSettlement(job, config);
  const ideaHref = IDEA_PROGRAM(programId);
  const task = taskByCriteria(job.spec.criteriaHash as Hex);

  return (
    <Panel
      label="Live · a job's life"
      meta={`#${job.id} · ${job.spec.policy}`}
      right={<StatusPill status={job.status} />}
      className="h-full overflow-auto"
    >
      {/* What the job actually is: the task the agent is paying to have solved */}
      <div className="mb-2.5 border border-border bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold">{task?.title ?? "Task"}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-fg">the job</span>
        </div>
        {task ? (
          <>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-fg">{task.prompt}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-fg">
              {task.entry
                ? <span>solution exports <Mono className="text-fg">{task.entry}()</Mono></span>
                : <span>structured answer</span>}
              <span>· graded by <Mono className="text-fg">{job.spec.verifierKind}</Mono>{task.entry ? " (hidden unit tests)" : " (hidden JSON schema)"}</span>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted-fg">criteria <Mono>{job.spec.criteriaHash.slice(0, 14)}…</Mono> (graded by <Mono>{job.spec.verifierKind}</Mono>)</p>
        )}
      </div>

      <div className="mb-3 flex items-center gap-3 border border-border bg-muted/30 px-3 py-2 text-[11px]">
        <span className="text-muted-fg">Escrow</span>
        <Mono className="font-semibold">{eth(job.spec.escrowWei)} ETH</Mono>
        <span className="h-3 w-px bg-border" />
        <span className="text-muted-fg">Requester</span>
        <AddrLink addr={job.spec.requester} />
        <a href={ideaHref} target="_blank" rel="noreferrer" className="ml-auto text-[10px] uppercase tracking-wide text-lane-injected hover:underline">verify on Idea ↗</a>
      </div>

      <ol className="relative space-y-2 pl-7">
        <span className="absolute left-[13px] top-2 bottom-2 w-px bg-border" aria-hidden />
        {steps.map((s, i) => (
          <StepRow key={s.key} step={s} index={i}>
            {s.key === "execute" && s.state === "done" && <DeliveredCode jobId={job.id} />}
            {s.key === "verify" && s.state === "done" && (
              <VerifierDetail jobId={job.id} task={task} pass={!!job.verdict?.pass} />
            )}
          </StepRow>
        ))}
        {settlement && <SettleRow settlement={settlement} index={steps.length} ideaHref={ideaHref} />}
      </ol>
    </Panel>
  );
}

function node(state: Step["state"]) {
  if (state === "done") return "bg-fg text-bg border-fg";
  if (state === "active") return "bg-bg text-fg border-fg animate-pulse";
  return "bg-bg text-muted-fg border-border";
}

function StepRow({ step, index, children }: { step: Step; index: number; children?: ReactNode }) {
  const dim = step.state === "pending";
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="relative"
    >
      <span className={`absolute -left-7 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11px] font-bold tnum ${node(step.state)}`}>
        {step.n}
      </span>
      <div className={`border px-3 py-2 transition-colors ${step.state === "active" ? "border-fg/40 bg-accent/5" : "border-border"} ${dim ? "opacity-45" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold">{step.title}</span>
          {step.lane && <LaneBadge lane={step.lane} />}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-fg">{step.detail}</p>

        {/* metadata row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {step.actor && <span className="flex items-center gap-1 text-muted-fg">actor <AddrLink addr={step.actor} /></span>}
          {step.amountWei && <span className="text-muted-fg">amount <Mono className="text-fg">{eth(step.amountWei)} ETH</Mono></span>}
          {step.promisedMs !== undefined && <span className="text-muted-fg">promised <Mono className="text-fg">{ms(step.promisedMs)}</Mono></span>}
          {step.measuredMs !== undefined && <span className="text-lane-injected">signed <Mono>{ms(step.measuredMs)}</Mono>✓</span>}
          {step.at && <TimeAgo iso={step.at} />}
          {step.modelTag && <ModelTag tag={step.modelTag} />}
          {step.hash && <span className="text-muted-fg" title={step.hash}>commit <Mono>{step.hash.slice(0, 10)}…</Mono></span>}
        </div>

        {children}

        {/* per-quote breakdown for the quote step */}
        {step.quotes && step.quotes.length > 0 && (
          <div className="mt-2 border-t border-border/60 pt-2">
            {step.quotes.map((q) => (
              <div key={q.provider} className={`flex items-center justify-between py-0.5 text-[11px] ${q.won ? "text-fg" : "text-muted-fg"}`}>
                <span className="flex items-center gap-2">
                  <AddrLink addr={q.provider} />
                  {q.won && <span className="border border-pass/50 px-1 text-[9px] font-bold uppercase text-pass">won</span>}
                </span>
                <span className="flex items-center gap-3">
                  <Mono>{eth(q.priceWei)} ETH</Mono>
                  <Mono className="text-muted-fg">{ms(q.promisedMs)}</Mono>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** The ending: exactly who got paid or refunded how much. */
function SettleRow({ settlement: s, index, ideaHref }: { settlement: ReturnType<typeof computeSettlement>; index: number; ideaHref: string }) {
  if (!s) return null;
  const paid = s.kind === "paid";
  return (
    <motion.li
      initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3) }}
      className="relative"
    >
      <span className={`absolute -left-7 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[11px] font-bold text-bg ${paid ? "bg-pass border-pass" : "bg-fail border-fail"}`}>
        {paid ? "✓" : "↺"}
      </span>
      <div className={`border-2 px-3 py-2.5 ${paid ? "border-pass/50 bg-pass/5" : "border-fail/50 bg-fail/5"}`}>
        <div className="flex items-center justify-between">
          <span className={`text-[12.5px] font-bold ${paid ? "text-pass" : "text-fail"}`}>{paid ? "Provider paid" : "Requester refunded"}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-fg">settled by the program</span>
        </div>

        {paid ? (
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <MoneyRow label="Winning provider receives" who={s.winner} amount={s.paidWei} tone="pass" />
            <MoneyRow label="Requester refunded unspent change" who={s.requester} amount={s.changeWei} tone="fg" />
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 text-[11.5px]">
            <MoneyRow label="Requester refunded (escrow + slash share)" who={s.requester} amount={s.refundWei} tone="fg" />
            <MoneyRow label="Provider bond slashed" who={s.winner} amount={s.slashWei} tone="fail" />
          </div>
        )}
        <a href={ideaHref} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] uppercase tracking-wide text-lane-injected hover:underline">verify settlement on Idea ↗</a>
      </div>
    </motion.li>
  );
}

function MoneyRow({ label, who, amount, tone }: { label: string; who?: string | null; amount?: string; tone: "pass" | "fail" | "fg" }) {
  const cls = tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : "text-fg";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-fg">
        {label}
        {who && <AddrLink addr={who} />}
      </span>
      <Mono className={`font-semibold ${cls} whitespace-nowrap`}>{amount ? `${eth(amount)} ETH` : "--"}</Mono>
    </div>
  );
}

/** How the verifier reached its verdict: the hidden test names it ran plus the
 *  actual vitest output, fetched off-chain by the evidence the hash commits to. */
function VerifierDetail({ jobId, task, pass }: { jobId: number; task?: Task; pass: boolean }) {
  const [evidence, setEvidence] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    fetch(`${INDEXER}/api/evidence/${jobId}`)
      .then((r) => r.json())
      .then((d) => { if (live) { setEvidence(d.evidence ?? null); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [jobId]);
  const isCode = task?.verifierKind !== "json-schema-v1";
  const tests = isCode && task ? [...task.testFile.matchAll(/it\(\s*["'`](.+?)["'`]/g)].map((m) => m[1]!) : [];
  const outputLabel = isCode ? "verifier output (real vitest run)" : "verifier output (JSON schema check)";
  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wide text-muted-fg">
          {isCode ? `Hidden test suite · ${tests.length} checks` : "Hidden JSON schema check"}
        </span>
        <span className={`text-[10.5px] font-bold uppercase ${pass ? "text-pass" : "text-fail"}`}>{pass ? "all passed" : "failed"}</span>
      </div>
      {isCode && (
        <ul className="mb-2 space-y-0.5">
          {tests.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px]">
              <span className={`mt-[1px] ${pass ? "text-pass" : "text-muted-fg"}`}>{pass ? "✓" : "•"}</span>
              <span className="text-muted-fg">{t}</span>
            </li>
          ))}
        </ul>
      )}
      {evidence ? (
        <details>
          <summary className="cursor-pointer text-[10.5px] uppercase tracking-wide text-lane-injected hover:underline">{outputLabel}</summary>
          <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap border border-border bg-bg p-2 text-[10px] leading-snug text-muted-fg">{evidence}</pre>
        </details>
      ) : (
        <span className="text-[10.5px] text-muted-fg">{loading ? "fetching verifier output…" : "verifier output not retained for this job"}</span>
      )}
    </div>
  );
}

/** The actual code the winning provider delivered (fetched by its output hash). */
function DeliveredCode({ jobId }: { jobId: number }) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${INDEXER}/api/evidence/${jobId}`)
      .then((r) => r.json())
      .then((d) => { if (live) setCode(d.delivered ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [jobId]);
  if (!code) return null;
  return (
    <details className="mt-2 border-t border-border/60 pt-2">
      <summary className="cursor-pointer text-[10.5px] uppercase tracking-wide text-lane-injected hover:underline">view delivered solution · {code.split("\n").length} lines</summary>
      <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap border border-border bg-bg p-2 text-[10px] leading-snug text-fg">{code}</pre>
    </details>
  );
}

function ModelTag({ tag }: { tag: string }) {
  const [persona, backend] = tag.split(":");
  const real = backend === "openrouter" || backend === "openai" || backend === "anthropic";
  return (
    <span className="flex items-center gap-1 border border-border px-1.5 text-[10px] uppercase tracking-wide">
      <span className={real ? "text-lane-injected" : "text-muted-fg"}>{real ? "OpenRouter" : backend}</span>
      <span className="text-muted-fg">· {persona}</span>
    </span>
  );
}

function TimeAgo({ iso }: { iso: string }) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return <span className="text-muted-fg">{secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`}</span>;
}
