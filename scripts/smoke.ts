// M2 lifecycle smoke on live hoodi: drive one job Open -> Paid and one
// Open -> Refunded (via expiry) against the deployed program, exercising both
// lanes — L1 value calls (register_provider, create_job) and injected calls
// (submit_quote, award_job, submit_receipt, submit_verdict, expire_job).
//
// Run: pnpm tsx scripts/smoke.ts
//
// This is a scratch proof of the M2 gate, not the production services (M3
// refactors the reusable pieces into packages/sdk). Everything here happens
// on real hoodi — no simulation.

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Hex,
} from "viem";
import {
  createVaraEthApi,
  WsVaraEthProvider,
  getMirrorClient,
} from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { hoodi, VALIDATOR_WS, ROUTER_ADDRESS } from "../packages/sdk/src/network.js";
import { account, readDeployment, type Role } from "../packages/sdk/src/env.js";
import { encodeCall, decodeReply, type ServiceName } from "../packages/sdk/src/codec.js";

const d = readDeployment();
const programId = d.programId;

const publicClient = createPublicClient({ chain: hoodi, transport: http() });
const provider = new WsVaraEthProvider(VALIDATOR_WS[0]);

// Status enum ordinals (must match program Status order).
const STATUS = [
  "Open", "Awarded", "Running", "Delivered", "Verified", "Paid", "Refunded", "Expired",
] as const;

// Job SCALE layout up to `status`: Option tag(1) + id u64(8) + JobSpec(106).
// JobSpec = requester(32) + escrow(16) + max_price(16) + deadline(4) +
//           verifier_kind(1) + criteria_hash(32) + policy(1) + quote_window(4).
const STATUS_OFFSET = 1 + 8 + 106;

let api: Awaited<ReturnType<typeof createVaraEthApi>>;

function signer(role: Role) {
  const wc = createWalletClient({ account: account(role), chain: hoodi, transport: http() });
  return walletClientToSigner(wc);
}

/** L1 value/command call through the mirror (register_provider, create_job). */
async function l1(role: Role, service: ServiceName, method: string, args: unknown[], value: bigint) {
  const mirror = getMirrorClient({ address: programId, publicClient, signer: signer(role) });
  const payload = encodeCall(service, method, args);
  const tx = await mirror.sendMessage(payload, value);
  await tx.sendAndWaitForReceipt();
  console.log(`  L1  ${role} ${service}.${method}(value=${value}) ✓`);
}

/** Decode a program reply payload (header-stripped) as a UTF-8 error string. */
function replyString(payload: Hex): string {
  const inner = decodeReply(payload).payload.replace(/^0x/, "");
  const bytes = Uint8Array.from(inner.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  // SCALE String = compact-length prefix (1 byte for <64 chars) + utf8 bytes.
  return new TextDecoder().decode(bytes.slice(1));
}

/**
 * Injected (fast-lane) call. Distinguishes three outcomes the naive path
 * conflates: a validator PURGE (retry), a program-level Err/panic (the reply
 * code is Error — surface the decoded message), and success.
 * `retryOn` lets time-gated calls (award/expire) wait out the program clock.
 */
async function injected(
  role: Role,
  service: ServiceName,
  method: string,
  args: unknown[],
  opts: { retryOn?: string; tries?: number } = {},
) {
  const payload = encodeCall(service, method, args);
  const tries = opts.tries ?? 1;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const tx = await api.createInjectedTransaction({ destination: programId, payload });
    await tx.sign(signer(role));
    const t0 = Date.now();
    const receipt = await tx.sendAndWaitForReceipt();
    const ms = Date.now() - t0;
    if (receipt.error) {
      // Purged (e.g. Outdated reference block): rebuild + retry.
      if (attempt < tries) { await sleep(3000); continue; }
      throw new Error(`injected ${service}.${method} purged: ${receipt.error}`);
    }
    await receipt.validateSignature();
    const p = receipt.promise;
    if (p.code.isError) {
      const msg = replyString(p.payload as Hex);
      if (opts.retryOn && msg.includes(opts.retryOn) && attempt < tries) {
        console.log(`  inj ${role} ${service}.${method} not ready ("${msg}") — retry ${attempt}/${tries}`);
        await sleep(6000);
        continue;
      }
      throw new Error(`injected ${service}.${method} rejected: ${msg}`);
    }
    console.log(`  inj ${role} ${service}.${method} ✓ (${ms}ms, validator-signed)`);
    return;
  }
}

/** Free read of a job's status. */
async function jobStatus(jobId: number): Promise<string> {
  const source = `0x${"00".repeat(20)}`;
  const payload = encodeCall("Market", "GetJob", [jobId]);
  const reply = await api.call.program.calculateReplyForHandle(source, programId, payload);
  const inner = decodeReply(reply.payload as Hex).payload.replace(/^0x/, "");
  const bytes = Uint8Array.from(inner.match(/../g)!.map((b) => parseInt(b, 16)));
  if (bytes[0] !== 1) return "None";
  return STATUS[bytes[STATUS_OFFSET]] ?? `?${bytes[STATUS_OFFSET]}`;
}

async function nextJobId(): Promise<number> {
  // Probe upward until GetJob returns None. Small demo volume -> cheap.
  for (let i = 0; i < 128; i++) {
    if ((await jobStatus(i)) === "None") return i;
  }
  throw new Error("could not find next job id");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BOND = BigInt(d.bondWei);
const ESCROW = parseEther("0.01");
const MAX_PRICE = parseEther("0.008");
const PRICE = parseEther("0.007");
const QUOTE_WINDOW = 24; // seconds
const DEADLINE = 48; // seconds

async function ensureRegistered(role: Role) {
  const source = `0x${"00".repeat(20)}`;
  const payload = encodeCall("Settlement", "GetProvider", [
    `0x${"00".repeat(12)}${account(role).address.slice(2)}`,
  ]);
  const reply = await api.call.program.calculateReplyForHandle(source, programId, payload);
  const inner = decodeReply(reply.payload as Hex).payload.replace(/^0x/, "");
  const isSome = inner.slice(0, 2) === "01";
  if (isSome) {
    console.log(`  ${role} already registered — skip bond`);
    return;
  }
  await l1(role, "Market", "RegisterProvider", [], BOND);
}

/** Poll a job's status until it leaves `None` (L1 create -> program state lag)
 *  or a predicate holds. */
async function waitForStatus(jobId: number, want: (s: string) => boolean, label: string) {
  for (let i = 0; i < 30; i++) {
    const s = await jobStatus(jobId);
    if (want(s)) return s;
    await sleep(4000);
  }
  throw new Error(`timed out waiting for job ${jobId} to be ${label} (last read stuck)`);
}

async function createJob(policy: "cheapest" | "assured"): Promise<number> {
  const id = await nextJobId();
  await l1(
    "requester",
    "Market",
    "CreateJob",
    [MAX_PRICE, DEADLINE, "unit-tests-v1", new Uint8Array(32).fill(7), policy, QUOTE_WINDOW],
    ESCROW,
  );
  await waitForStatus(id, (s) => s === "Open", "Open");
  return id;
}

async function main() {
  await provider.connect();
  api = await createVaraEthApi(provider, publicClient, ROUTER_ADDRESS, signer("deployer"));

  console.log("=== Job 1: Open -> Paid (assured, steady bot passes) ===");
  await ensureRegistered("bot-steady");
  const j1 = await createJob("assured");
  console.log(`  job ${j1} created, status=Open`);
  await injected("bot-steady", "Market", "SubmitQuote", [j1, PRICE, 400]);
  console.log(`  quote in; awaiting the ${QUOTE_WINDOW}s window on the program clock...`);
  // award retries until the program's block_timestamp passes the window.
  await injected("keeper", "Market", "AwardJob", [j1], { retryOn: "window still open", tries: 12 });
  await waitForStatus(j1, (s) => s === "Awarded", "Awarded");
  console.log(`  status=Awarded ✓`);
  await injected("bot-steady", "Settlement", "SubmitReceipt", [j1, new Uint8Array(32).fill(9), "mock"]);
  await waitForStatus(j1, (s) => s === "Delivered", "Delivered");
  await injected("verifier", "Settlement", "SubmitVerdict", [j1, true, new Uint8Array(32).fill(1)]);
  const s1 = await waitForStatus(j1, (s) => s === "Paid" || s === "Refunded", "settled");
  console.log(`  job ${j1} final status=${s1} ${s1 === "Paid" ? "✓" : "✗ EXPECTED Paid"}`);

  console.log("\n=== Job 2: Open -> Refunded (via expiry) ===");
  const j2 = await createJob("cheapest");
  console.log(`  job ${j2} created, status=Open`);
  await injected("bot-steady", "Market", "SubmitQuote", [j2, PRICE, 400]);
  console.log(`  quote in; awaiting the window...`);
  await injected("keeper", "Market", "AwardJob", [j2], { retryOn: "window still open", tries: 12 });
  await waitForStatus(j2, (s) => s === "Awarded", "Awarded");
  console.log(`  status=Awarded ✓; letting the ${DEADLINE}s deadline lapse...`);
  // expire retries until the program clock passes awarded_at + deadline.
  await injected("keeper", "Settlement", "ExpireJob", [j2], { retryOn: "not past", tries: 15 });
  const s2 = await waitForStatus(j2, (s) => s === "Expired", "Expired");
  console.log(`  job ${j2} final status=${s2} ${s2 === "Expired" ? "✓" : "✗ EXPECTED Expired"}`);

  await provider.disconnect?.();
  const ok = s1 === "Paid" && s2 === "Expired";
  console.log(`\n${ok ? "✓ LIFECYCLE SMOKE PASSED" : "✗ smoke failed"} — both flows on live hoodi`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
