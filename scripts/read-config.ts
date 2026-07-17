// Read the live program's config back and assert it matches the deployment.
// This is the end-to-end proof that the SCALE-encoded init actually decoded
// correctly on-chain (verifier ActorId + economics), using only free reads
// (calculateReplyForHandle — no tx, no gas).
//
// Run: pnpm tsx scripts/read-config.ts

import { createPublicClient, http } from "viem";
import { createVaraEthApi, WsVaraEthProvider } from "@vara-eth/api";
import { hoodi, VALIDATOR_WS, ROUTER_ADDRESS } from "../packages/sdk/src/network.js";
import { readDeployment } from "../packages/sdk/src/env.js";
import { encodeCall, decodeReply, ethAddressToActorId, type Hex } from "../packages/sdk/src/codec.js";

/** Read a little-endian unsigned integer of `size` bytes from `bytes` at `off`. */
function readUintLE(bytes: Uint8Array, off: number, size: number): bigint {
  let v = 0n;
  for (let i = size - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[off + i]!);
  return v;
}

function hexToBytes(hex: Hex): Uint8Array {
  const h = hex.replace(/^0x/, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function main() {
  const d = readDeployment();
  const publicClient = createPublicClient({ chain: hoodi, transport: http() });
  const provider = new WsVaraEthProvider(VALIDATOR_WS[0]);
  await provider.connect();
  const api = await createVaraEthApi(provider, publicClient, ROUTER_ADDRESS);

  // Any source works for a free read; the RPC wants a 20-byte address.
  const source = `0x${"00".repeat(20)}`;
  const payload = encodeCall("Settlement", "GetConfig", []);
  const reply = await api.call.program.calculateReplyForHandle(source, d.programId, payload);

  const inner = decodeReply(reply.payload as Hex).payload;
  const bytes = hexToBytes(inner);

  // Config = verifier: ActorId(32) ++ bond_wei: u128(16 LE) ++
  //          slash_wei: u128(16 LE) ++ slash_to_requester_bps: u32(4 LE)
  const verifier = `0x${Buffer.from(bytes.slice(0, 32)).toString("hex")}` as Hex;
  const bondWei = readUintLE(bytes, 32, 16);
  const slashWei = readUintLE(bytes, 48, 16);
  const bps = Number(readUintLE(bytes, 64, 4));

  const expectedVerifier = ethAddressToActorId(d.verifier as Hex);
  const ok =
    verifier === expectedVerifier &&
    bondWei === BigInt(d.bondWei) &&
    slashWei === BigInt(d.slashWei) &&
    bps === d.slashToRequesterBps;

  console.log("on-chain config:");
  console.log(`  verifier ActorId: ${verifier}`);
  console.log(`  bond_wei:         ${bondWei}`);
  console.log(`  slash_wei:        ${slashWei}`);
  console.log(`  slash_bps:        ${bps}`);
  console.log("");
  console.log(`expected verifier:  ${expectedVerifier}`);
  console.log(ok ? "\n✓ config matches deployment — init decoded correctly" : "\n✗ MISMATCH");

  await provider.disconnect?.();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("read failed:", err);
  process.exit(1);
});
