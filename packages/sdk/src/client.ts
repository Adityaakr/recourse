// createRecourse() — the one on-chain interface every service uses. Wraps the
// two lanes (L1 value calls through the mirror; injected fast-lane calls) and
// typed state reads, over a validator connection that fails over to whichever
// node actually has the program's state.
//
// Every method proven against the live program by scripts/smoke.ts.

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createVaraEthApi,
  WsVaraEthProvider,
  getMirrorClient,
} from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { hoodi, VALIDATOR_WS, ROUTER_ADDRESS } from "./network.js";
import { privateKey, type Role } from "./env.js";
import { encodeCall, encodeCtorPayload, decodeReply, type ServiceName } from "./codec.js";
import { ScaleReader } from "./scale.js";
import {
  decodeJob,
  decodeProvider,
  decodeConfig,
  type Job,
  type Provider,
  type Config,
  type Status,
} from "./types.js";

export type { Job, Provider, Config } from "./types.js";
export { encodeCtorPayload };

/** A signer bound to one service account. */
export interface Account {
  address: Hex;
  walletClient: WalletClient;
  signer: ReturnType<typeof walletClientToSigner>;
}

export interface InjectedOpts {
  /** Retry while the program rejects with a message containing this substring
   *  (used for time-gated award/expire). */
  retryOn?: string;
  tries?: number;
  /** ms between retries (default 6000). */
  gap?: number;
}

export interface InjectedResult {
  /** Client-measured send-to-receipt latency — the fast-lane pitch number. */
  ms: number;
  /** Decoded reply payload (inner SCALE, header stripped), or null for unit. */
  reply: Hex | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ZERO_ADDR: Hex = `0x${"00".repeat(20)}`;

export interface Recourse {
  readonly programId: Hex;
  readonly publicClient: PublicClient;
  account(role: Role): Account;
  /** ActorId (32-byte) for a role — the identity the program sees for it. */
  actorId(role: Role): Hex;
  l1(role: Role, service: ServiceName, method: string, args: unknown[], value: bigint): Promise<Hex>;
  injected(role: Role, service: ServiceName, method: string, args: unknown[], opts?: InjectedOpts): Promise<InjectedResult>;
  read(service: ServiceName, method: string, args: unknown[]): Promise<ScaleReader>;
  getJob(id: number): Promise<Job | null>;
  listJobs(status: Status | null, cursor: number, limit: number): Promise<Job[]>;
  getProvider(actorId: Hex): Promise<Provider | null>;
  getConfig(): Promise<Config>;
  disconnect(): Promise<void>;
}

export interface RecourseOpts {
  programId: Hex;
  /** Role whose signer the shared api uses for its own L1 ops (default deployer-less reads work too). */
  apiSigner?: Role;
}

export async function createRecourse(opts: RecourseOpts): Promise<Recourse> {
  const programId = opts.programId;
  const publicClient = createPublicClient({ chain: hoodi, transport: http() });
  const accounts = new Map<Role, Account>();

  function account(role: Role): Account {
    let a = accounts.get(role);
    if (!a) {
      const acct = privateKeyToAccount(privateKey(role));
      const walletClient = createWalletClient({ account: acct, chain: hoodi, transport: http() });
      a = { address: acct.address, walletClient, signer: walletClientToSigner(walletClient) };
      accounts.set(role, a);
    }
    return a;
  }

  function actorId(role: Role): Hex {
    return `0x${"00".repeat(12)}${account(role).address.slice(2)}`;
  }

  // Connect to the first validator that has the program state (fresh programs
  // may not be on every node yet). A long-lived validator connection can go
  // stale (stop seeing new jobs), so we reconnect to a fresh synced validator
  // periodically in the background - this makes every long-running service
  // (indexer, keeper, verifier, bots) self-heal.
  let provider!: WsVaraEthProvider;
  let api!: Awaited<ReturnType<typeof createVaraEthApi>>;
  const apiSigner = opts.apiSigner ? account(opts.apiSigner).signer : undefined;

  async function connect(): Promise<void> {
    for (let round = 0; round < 6; round++) {
      for (const url of VALIDATOR_WS) {
        const p = new WsVaraEthProvider(url);
        try {
          await p.connect();
          const a = await createVaraEthApi(p, publicClient, ROUTER_ADDRESS, apiSigner);
          await a.call.program.calculateReplyForHandle(ZERO_ADDR, programId, encodeCall("Settlement", "GetConfig", []));
          const old = provider;
          provider = p;
          api = a;
          if (old) await old.disconnect?.().catch(() => {});
          return;
        } catch {
          await p.disconnect?.().catch(() => {});
        }
      }
      if (round === 5) throw new Error("no validator has the program state");
      await sleep(5000);
    }
  }

  await connect();
  // Refresh the connection every 30s so no service ever lags on stale state.
  const reconnectTimer = setInterval(() => { connect().catch(() => {}); }, 30_000);
  if (typeof reconnectTimer === "object" && "unref" in reconnectTimer) (reconnectTimer as { unref: () => void }).unref();

  async function l1(role: Role, service: ServiceName, method: string, args: unknown[], value: bigint): Promise<Hex> {
    const mirror = getMirrorClient({ address: programId, publicClient, signer: account(role).signer });
    const payload = encodeCall(service, method, args);
    const tx = await mirror.sendMessage(payload, value);
    const receipt = await tx.sendAndWaitForReceipt();
    return receipt.transactionHash as Hex;
  }

  async function injected(role: Role, service: ServiceName, method: string, args: unknown[], o: InjectedOpts = {}): Promise<InjectedResult> {
    const payload = encodeCall(service, method, args);
    const tries = o.tries ?? 1;
    const gap = o.gap ?? 6000;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const tx = await api.createInjectedTransaction({ destination: programId, payload });
      // Do the one-time setup (reference block, slot validator, signature)
      // BEFORE timing, and route to the slot validator for lowest latency, so
      // the measured number is the pure send-to-validator-signed-receipt trip.
      await tx.setReferenceBlock();
      try { await tx.setSlotValidator(); } catch { /* fall back to default */ }
      await tx.sign(account(role).signer);
      const t0 = Date.now();
      const receipt = await tx.sendAndWaitForReceipt();
      const ms = Date.now() - t0;
      if (receipt.error) {
        if (attempt < tries) { await sleep(3000); continue; }
        throw new Error(`injected ${service}.${method} purged: ${receipt.error}`);
      }
      await receipt.validateSignature();
      const p = receipt.promise;
      if (p.code.isError) {
        const msg = new TextDecoder().decode(
          Uint8Array.from((decodeReply(p.payload as Hex).payload.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16))).slice(1),
        );
        if (o.retryOn && msg.includes(o.retryOn) && attempt < tries) {
          await sleep(gap);
          continue;
        }
        throw new Error(`injected ${service}.${method} rejected: ${msg}`);
      }
      const inner = decodeReply(p.payload as Hex);
      return { ms, reply: inner.header ? (inner.payload as Hex) : null };
    }
    throw new Error(`injected ${service}.${method} exhausted retries`);
  }

  async function read(service: ServiceName, method: string, args: unknown[]): Promise<ScaleReader> {
    const payload = encodeCall(service, method, args);
    const reply = await api.call.program.calculateReplyForHandle(ZERO_ADDR, programId, payload);
    return new ScaleReader(decodeReply(reply.payload as Hex).payload as Hex);
  }

  async function getJob(id: number): Promise<Job | null> {
    const r = await read("Market", "GetJob", [id]);
    return r.option(decodeJob);
  }

  async function listJobs(status: Status | null, cursor: number, limit: number): Promise<Job[]> {
    // GetJob is exact + cheap for the demo's small id space; ListJobs decoding
    // is the same shape wrapped in a Vec, added when volume needs it.
    const out: Job[] = [];
    for (let id = cursor; id < cursor + limit; id++) {
      const j = await getJob(id);
      if (!j) break;
      if (status === null || j.status === status) out.push(j);
    }
    return out;
  }

  async function getProvider(actor: Hex): Promise<Provider | null> {
    const r = await read("Settlement", "GetProvider", [actor]);
    return r.option(decodeProvider);
  }

  async function getConfig(): Promise<Config> {
    const r = await read("Settlement", "GetConfig", []);
    return decodeConfig(r);
  }

  async function disconnect(): Promise<void> {
    clearInterval(reconnectTimer);
    await provider.disconnect?.();
  }

  return {
    programId, publicClient, account, actorId,
    l1, injected, read, getJob, listJobs, getProvider, getConfig, disconnect,
  };
}
