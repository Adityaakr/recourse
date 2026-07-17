// Full breakdown of one job, shown in the motion dialog: terms, the whole
// quote book, the award decision, delivery, verdict, and settlement. A richer
// surface than the compact dashboard panels.

import type { Job, Config } from "../lib/api.js";
import { eth, ms, shortAddr } from "../lib/format.js";
import { Mono, StatusPill, LaneBadge, AddrLink, KV } from "./ui.js";

export function JobDetail({ job, config }: { job: Job; config: Config | null }) {
  const winner = job.winner?.toLowerCase();
  const settled = ["Paid", "Refunded", "Expired"].includes(job.status);
  const paid = job.status === "Paid";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mono className="text-[15px] font-semibold">Job #{job.id}</Mono>
        <StatusPill status={job.status} />
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-fg">{job.spec.policy} routing</span>
      </div>

      <Section title="Terms">
        <KV k="Requester"><AddrLink addr={job.spec.requester} /></KV>
        <KV k="Escrow"><Mono>{eth(job.spec.escrowWei)} ETH</Mono></KV>
        <KV k="Max price"><Mono>{eth(job.spec.maxPriceWei)} ETH</Mono></KV>
        <KV k="Quote window"><Mono>{job.spec.quoteWindowSecs}s</Mono></KV>
        <KV k="Deadline"><Mono>{job.spec.deadlineSecs}s</Mono></KV>
        <KV k="Verifier"><Mono>{job.spec.verifierKind}</Mono></KV>
        <KV k="Criteria hash"><Mono>{job.spec.criteriaHash.slice(0, 18)}…</Mono></KV>
      </Section>

      <Section title={`Quote book · ${job.quotes.length}`}>
        {job.quotes.length === 0 ? (
          <p className="py-2 text-[11px] text-muted-fg">No quotes.</p>
        ) : (
          <div className="border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b bg-card-head px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
              <span>Provider</span><span className="text-right">Price</span><span className="text-right">Promised</span>
            </div>
            {[...job.quotes].sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei))).map((q) => (
              <div key={q.provider} className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-border/60 px-2.5 py-1.5 last:border-0 ${q.provider.toLowerCase() === winner ? "bg-pass/5" : ""}`}>
                <span className="flex items-center gap-2"><AddrLink addr={q.provider} />{q.provider.toLowerCase() === winner && <span className="border border-pass/50 px-1 text-[9px] font-bold uppercase text-pass">win</span>}</span>
                <Mono className="text-right text-[12px] font-semibold">{eth(q.priceWei)}</Mono>
                <Mono className="text-right text-[11px] text-muted-fg">{ms(q.promisedLatencyMs)}</Mono>
              </div>
            ))}
          </div>
        )}
        {job.awardReason && <p className="mt-2 text-[11px] leading-relaxed text-muted-fg"><span className="term-label" style={{ color: "hsl(var(--pass))" }}>Award </span>{job.awardReason}</p>}
      </Section>

      {(job.receipt || job.verdict) && (
        <Section title="Delivery & verdict">
          {job.receipt && <><KV k="Output hash"><Mono>{job.receipt.outputHash.slice(0, 18)}…</Mono></KV><KV k="Model"><Mono>{job.receipt.modelTag}</Mono></KV></>}
          {job.verdict && (
            <>
              <KV k="Verdict" tone={job.verdict.pass ? "pass" : "fail"}>{job.verdict.pass ? "PASS" : "FAIL"}</KV>
              <KV k="Signed by"><LaneBadge lane="injected" /> <Mono>{shortAddr(job.verdict.verifier)}</Mono></KV>
              <KV k="Evidence"><Mono>{job.verdict.evidenceHash.slice(0, 18)}…</Mono></KV>
            </>
          )}
        </Section>
      )}

      {settled && (
        <div className={`border px-3 py-2.5 ${paid ? "border-pass/40 bg-pass/5" : "border-fail/40 bg-fail/5"}`}>
          <div className={`text-[12px] font-bold uppercase tracking-wide ${paid ? "text-pass" : "text-fail"}`}>{paid ? "Paid on success" : "Refunded + bond slashed"}</div>
          <p className="mt-1 text-[11px] text-muted-fg">
            {paid ? "The provider was paid the quoted price; the escrow difference returned to the requester." : `Escrow refunded and ${config ? eth(config.slashWei) : "the"} ETH bond slashed, enforced by the protocol.`}
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="term-label mb-1.5">{title}</div>
      <div>{children}</div>
    </div>
  );
}
