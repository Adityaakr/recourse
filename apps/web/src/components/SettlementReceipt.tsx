// Panel 4 — the settlement receipt. Promised vs actual, the outcome the
// protocol enforced, and the evidence. This is where act one lands: a red
// receipt with a real bond slash, or act two's green paid receipt.

import type { Job, Config } from "../lib/api.js";
import { eth, ms } from "../lib/format.js";
import { Panel, Mono, StatusPill, Empty } from "./ui.js";
import { Receipt } from "lucide-react";

const TERMINAL = ["Paid", "Refunded", "Expired"];

export function SettlementReceipt({ job, config }: { job: Job | null; config: Config | null }) {
  if (!job) return <Panel title="Settlement receipt" icon={<Receipt size={16} />} tone="pass"><Empty>The final receipt shows here — paid, or refunded and slashed.</Empty></Panel>;

  const settled = TERMINAL.includes(job.status);
  const winnerQuote = job.quotes.find((q) => q.provider.toLowerCase() === job.winner?.toLowerCase());
  const price = winnerQuote ? BigInt(winnerQuote.priceWei) : 0n;
  const escrow = BigInt(job.spec.escrowWei);
  const paid = job.status === "Paid";
  const slash = config ? BigInt(config.slashWei) : 0n;

  return (
    <Panel title="Settlement receipt" hint={`Job #${job.id}`} icon={<Receipt size={16} />} tone={paid ? "pass" : settled ? "fail" : "neutral"} right={<StatusPill status={job.status} />}>
      {!settled ? (
        <Empty>Settlement pending — the verdict decides pay or refund.</Empty>
      ) : (
        <div className="space-y-4">
          <div
            className={`rounded-xl border p-4 ${paid ? "border-pass/40 bg-pass/5" : "border-fail/40 bg-fail/5"}`}
          >
            <div className={`text-sm font-semibold ${paid ? "text-pass" : "text-fail"}`}>
              {paid ? "Paid on success" : "Refunded + bond slashed"}
            </div>
            <p className="mt-1 text-xs text-muted-fg">
              {paid
                ? "Success criteria met. The provider was paid the quoted price; the escrow difference returned to the requester."
                : "Success criteria not met. Escrow refunded to the requester and the provider's bond was slashed — enforced by the protocol."}
            </p>
          </div>

          <dl className="divide-y rounded-xl border">
            <Row label="Escrow funded"><Mono>{eth(job.spec.escrowWei)} ETH</Mono></Row>
            {winnerQuote && (
              <Row label="Quoted price"><Mono>{eth(price)} ETH</Mono></Row>
            )}
            {paid ? (
              <>
                <Row label="Paid to provider" tone="pass"><Mono>{eth(price)} ETH</Mono></Row>
                <Row label="Returned to requester"><Mono>{eth(escrow - price)} ETH</Mono></Row>
              </>
            ) : (
              <>
                <Row label="Refunded to requester" tone="pass"><Mono>{eth(escrow)} ETH</Mono></Row>
                <Row label="Bond slashed" tone="fail"><Mono>{eth(slash)} ETH</Mono></Row>
              </>
            )}
            {winnerQuote && (
              <Row label="Promised latency"><Mono>{ms(winnerQuote.promisedLatencyMs)}</Mono></Row>
            )}
          </dl>

          {job.verdict && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-fg">
              Verdict signed by the verifier · evidence <Mono>{job.verdict.evidenceHash.slice(0, 12)}…</Mono>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Row({ label, tone, children }: { label: string; tone?: "pass" | "fail"; children: React.ReactNode }) {
  const toneCls = tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : "";
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <dt className="text-xs text-muted-fg">{label}</dt>
      <dd className={`text-sm font-medium ${toneCls}`}>{children}</dd>
    </div>
  );
}
