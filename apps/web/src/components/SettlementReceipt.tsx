// The settlement receipt. Promised vs actual, the outcome the protocol
// enforced, and the evidence. Act one lands here as a red slash receipt; act
// two as a green paid receipt.

import type { Job, Config } from "../lib/api.js";
import { eth, ms } from "../lib/format.js";
import { Panel, Mono, StatusPill, Empty, KV } from "./ui.js";

const TERMINAL = ["Paid", "Refunded", "Expired"];

export function SettlementReceipt({ job, config }: { job: Job | null; config: Config | null }) {
  if (!job) return <Panel label="Settlement"><Empty>The final receipt shows here: paid, or refunded and slashed.</Empty></Panel>;

  const settled = TERMINAL.includes(job.status);
  const winnerQuote = job.quotes.find((q) => q.provider.toLowerCase() === job.winner?.toLowerCase());
  const price = winnerQuote ? BigInt(winnerQuote.priceWei) : 0n;
  const escrow = BigInt(job.spec.escrowWei);
  const paid = job.status === "Paid";
  const slash = config ? BigInt(config.slashWei) : 0n;

  return (
    <Panel label="Settlement" meta={`#${job.id}`} right={<StatusPill status={job.status} />}>
      {!settled ? (
        <Empty>Settlement pending: the verdict decides pay or refund.</Empty>
      ) : (
        <div className="space-y-3">
          <div className={`border px-2.5 py-2 ${paid ? "border-pass/40 bg-pass/5" : "border-fail/40 bg-fail/5"}`}>
            <div className={`text-[12px] font-bold uppercase tracking-wide ${paid ? "text-pass" : "text-fail"}`}>
              {paid ? "Paid on success" : "Refunded + bond slashed"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-fg">
              {paid
                ? "Success criteria met. Provider paid the quoted price; escrow difference returned to the requester."
                : "Success criteria not met. Escrow refunded and the provider's bond slashed, enforced by the protocol."}
            </p>
          </div>

          <div>
            <KV k="Escrow funded"><Mono>{eth(job.spec.escrowWei)} ETH</Mono></KV>
            {winnerQuote && <KV k="Quoted price"><Mono>{eth(price)} ETH</Mono></KV>}
            {paid ? (
              <>
                <KV k="Paid to provider" tone="pass"><Mono>{eth(price)} ETH</Mono></KV>
                <KV k="Returned to requester"><Mono>{eth(escrow - price)} ETH</Mono></KV>
              </>
            ) : (
              <>
                <KV k="Refunded to requester" tone="pass"><Mono>{eth(escrow)} ETH</Mono></KV>
                <KV k="Bond slashed" tone="fail"><Mono>{eth(slash)} ETH</Mono></KV>
              </>
            )}
            {winnerQuote && <KV k="Promised latency"><Mono>{ms(winnerQuote.promisedLatencyMs)}</Mono></KV>}
          </div>

          {job.verdict && (
            <div className="border border-border bg-muted/30 px-2.5 py-1.5 text-[10.5px] text-muted-fg">
              Verdict signed by the verifier · evidence <Mono>{job.verdict.evidenceHash.slice(0, 12)}…</Mono>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
