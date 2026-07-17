// Browser side of the two lanes. Value crossings (deposit, withdraw) go through
// the wallet as classic L1 transactions (gas) in actions.ts; THIS module is the
// injected fast lane — it builds and signs injected transactions with the
// connected wallet, which the wallet presents as a gasless "Signature request".
//
// The reference is vara-eth-skills/examples/digit-recognition-injected-frontend:
// createInjectedTransaction({ destination, payload }) -> sign(signer) ->
// sendAndWaitForReceipt(). An injected transaction carries no value (a non-zero
// value is purged with NonZeroValue), which is exactly why it costs no gas.

import { createPublicClient, http, type Hex, type WalletClient } from "viem";
import { createVaraEthApi, WsVaraEthProvider } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { ROUTER_ADDRESS, VALIDATOR_WS } from "@recourse/sdk/network";
import { encodeCall, decodeReply } from "@recourse/sdk/codec";
import { ScaleReader } from "@recourse/sdk/scale";
import { hoodi } from "./chain.js";

const ZERO_ADDR: Hex = `0x${"00".repeat(20)}`;

const publicClient = () => createPublicClient({ chain: hoodi, transport: http() });

// A shared validator connection. A freshly-deployed program may not be synced
// on every validator yet, so we connect to the first one that actually answers
// a read for THIS program, and cache it. Any later failure drops the cache so
// the next call re-finds a synced validator (self-healing, like the SDK).
let providerPromise: Promise<WsVaraEthProvider> | null = null;
function resetProvider() { providerPromise = null; }

async function getProvider(verifyProgram?: Hex): Promise<WsVaraEthProvider> {
  if (!providerPromise) {
    providerPromise = (async () => {
      let lastErr: unknown;
      for (const url of VALIDATOR_WS) {
        const p = new WsVaraEthProvider(url);
        try {
          await p.connect();
          if (verifyProgram) {
            const api = await createVaraEthApi(p, publicClient(), ROUTER_ADDRESS);
            await api.call.program.calculateReplyForHandle(
              ZERO_ADDR, verifyProgram, encodeCall("Settlement", "GetConfig", []),
            );
          }
          return p;
        } catch (e) {
          lastErr = e;
          await p.disconnect?.().catch(() => {});
        }
      }
      throw lastErr ?? new Error("no validator has the program state");
    })().catch((e) => {
      providerPromise = null; // let the next call retry a fresh connect
      throw e;
    });
  }
  return providerPromise;
}

async function apiFor(walletClient: WalletClient, programId: Hex) {
  const provider = await getProvider(programId);
  const signer = walletClientToSigner(walletClient);
  const api = await createVaraEthApi(provider, publicClient(), ROUTER_ADDRESS, signer);
  return { api, signer };
}

export interface InjectedSend {
  /** Validator-signed receipt hash (the gasless lane's proof-of-inclusion). */
  txHash: Hex;
  /** Client-measured send-to-signed-receipt latency in ms. */
  ms: number;
  /** Inner SCALE reply bytes, or null for a unit reply. */
  reply: Hex | null;
}

/** Decode a program Err reply (SCALE String) into its message. */
function errMessage(payload: Hex): string {
  const inner = decodeReply(payload).payload.replace(/^0x/, "");
  const bytes = Uint8Array.from(inner.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  return new TextDecoder().decode(bytes.slice(1)); // strip the compact-length prefix
}

/**
 * Send an injected (gasless) call to the program with the connected wallet.
 * The wallet shows a Signature request, not a gas transaction.
 */
export async function injectedCall(
  walletClient: WalletClient,
  programId: Hex,
  service: "Market" | "Settlement",
  method: string,
  args: unknown[],
): Promise<InjectedSend> {
  const { api, signer } = await apiFor(walletClient, programId);
  const payload = encodeCall(service, method, args);
  const tx = await api.createInjectedTransaction({ destination: programId, payload });
  await tx.setReferenceBlock();
  try {
    await tx.setSlotValidator();
  } catch {
    /* fall back to default validator */
  }
  await tx.sign(signer);
  const t0 = Date.now();
  const receipt = await tx.sendAndWaitForReceipt();
  const ms = Date.now() - t0;
  if (receipt.error) throw new Error(`purged: ${receipt.error}`);
  await receipt.validateSignature();
  const p = receipt.promise;
  if (p.code.isError) throw new Error(errMessage(p.payload as Hex));
  const inner = decodeReply(p.payload as Hex);
  return { txHash: receipt.txHash as Hex, ms, reply: inner.header ? (inner.payload as Hex) : null };
}

/** Read an actor's internal (vault-ledger) balance in wei — a free query. */
export async function readBalance(programId: Hex, address: Hex): Promise<bigint> {
  const actorId: Hex = `0x${"00".repeat(12)}${address.slice(2)}`;
  const payload = encodeCall("Market", "BalanceOf", [actorId]);
  const once = async () => {
    const provider = await getProvider(programId);
    const api = await createVaraEthApi(provider, publicClient(), ROUTER_ADDRESS);
    const reply = await api.call.program.calculateReplyForHandle(ZERO_ADDR, programId, payload);
    return new ScaleReader(decodeReply(reply.payload as Hex).payload as Hex).u128();
  };
  try {
    return await once();
  } catch {
    // The cached validator may have dropped or de-synced; re-find one and retry.
    resetProvider();
    return await once();
  }
}
