// Deploy the recourse program to hoodi and record it in deployments/hoodi.json.
//
// Sequence (all grounded against @vara-eth/api 0.5.2 typings):
//   1. upload wasm as an EIP-4844 blob via router.requestCodeValidation
//      (WVARA permit pays the base fee; the SDK builds the blob + KZG itself)
//   2. wait for the code to reach Validated
//   3. create the program (deterministic salt) + seed executable balance
//   4. send the SCALE-encoded ctor as the first (init) message
//
// Run: pnpm tsx scripts/deploy.ts
//
// Reverse gas: the program pays its own execution from a WVARA executable
// balance. If that balance hits zero the program silently stalls, so we seed
// it at create time and the health script watches it.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import {
  createVaraEthApi,
  WsVaraEthProvider,
  getMirrorClient,
} from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { initKzgLoading } from "@vara-eth/api/util";
import {
  hoodi,
  HOODI_RPC_WS,
  ROUTER_ADDRESS,
  WVARA_ADDRESS,
  EXPLORER_TX,
} from "../packages/sdk/src/network.js";
import {
  account,
  address,
  privateKey,
  REPO_ROOT,
  DEPLOYMENTS_PATH,
  type Deployment,
} from "../packages/sdk/src/env.js";
import { encodeCtorPayload, ethAddressToActorId } from "../packages/sdk/src/codec.js";

const WASM_PATH = join(
  REPO_ROOT,
  "program/target/wasm32-gear/release/recourse.opt.wasm",
);

// Fixed salt -> deterministic program address across redeploys of the same
// code. 32 zero bytes; bump only to intentionally mint a fresh program.
const SALT: Hex = `0x${"00".repeat(32)}`;

// Economics, from env (see .env.example). Bond/slash in wei.
const BOND_WEI = BigInt(process.env.RECOURSE_BOND_WEI ?? "20000000000000000");
const SLASH_WEI = BigInt(process.env.RECOURSE_SLASH_WEI ?? "10000000000000000");
const SLASH_TO_REQUESTER_BPS = Number(
  process.env.RECOURSE_SLASH_TO_REQUESTER_BPS ?? "5000",
);

// WVARA seeded into the program's executable balance at create time (12-dec
// WVARA). Reverse gas: every message the program processes is paid from here.
// 1500 WVARA is enough for the two-act demo; a top-up script tops it up if a
// long run drains it, and the health script reports the live level.
const EXEC_BALANCE_WVARA = 1500n * 10n ** 12n;

/** A permit deadline one hour out, in unix SECONDS (EIP-2612 compares against
 *  block.timestamp). */
function permitDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 3600);
}

async function main() {
  const deployer = account("deployer");
  console.log(`deployer:  ${deployer.address}`);

  const code = new Uint8Array(readFileSync(WASM_PATH));
  console.log(`wasm:      ${WASM_PATH} (${code.length} bytes)`);

  // KZG warm-up so the first blob build does not pay the load latency.
  initKzgLoading();

  const publicClient = createPublicClient({ chain: hoodi, transport: http() });
  const walletClient = createWalletClient({
    account: deployer,
    chain: hoodi,
    transport: http(),
  });
  const signer = walletClientToSigner(walletClient);

  const provider = new WsVaraEthProvider(HOODI_RPC_WS);
  const api = await createVaraEthApi(
    provider,
    publicClient,
    ROUTER_ADDRESS,
    signer,
  );
  const router = api.eth.router;
  const wvara = api.eth.wvara;

  // Resumable: WVARA is spent per step, so we never redo a completed one.
  // RECOURSE_RESUME_PROGRAM_ID lets a partially-finished deploy continue from
  // an already-created program (e.g. init failed after create).
  const resumeProgramId = process.env.RECOURSE_RESUME_PROGRAM_ID as Hex | undefined;
  let programId: Hex;
  let codeId: Hex;
  let uploadHash = "";

  if (resumeProgramId) {
    programId = resumeProgramId;
    codeId = (await router.programCodeId(programId)) as Hex;
    console.log(`resuming existing program: ${programId}`);
    console.log(`code id:   ${codeId}`);
  } else {
    // --- 1. upload wasm as a blob, paying the base fee via WVARA permit ----
    const baseFee = await router.requestCodeValidationBaseFee();
    const uploadDeadline = permitDeadline();
    const { signature: uploadPermit } = await wvara.prepareAndSignPermitData(
      router.address,
      baseFee,
      uploadDeadline,
    );
    const uploadTx = await router.requestCodeValidation(
      code,
      uploadDeadline,
      uploadPermit,
    );
    codeId = uploadTx.codeId as Hex;
    console.log(`code id:   ${codeId}`);

    // Only pay + submit if the code is not already validated (idempotent).
    const state = await router.codeState(codeId);
    if (state === 2 /* Validated */) {
      console.log("code already validated ✓ (skipping upload)");
    } else {
      uploadHash = await uploadTx.send();
      console.log(`upload tx: ${EXPLORER_TX(uploadHash)}`);
      console.log("waiting for code validation...");
      const validated = await uploadTx.waitForCodeGotValidated();
      if (!validated) throw new Error("code validation failed");
      console.log("code validated ✓");
    }

    // --- 3. create the program + seed executable balance ------------------
    const execDeadline = permitDeadline();
    const { signature: execPermit } = await wvara.prepareAndSignPermitData(
      router.address,
      EXEC_BALANCE_WVARA,
      execDeadline,
    );
    const createTx = router
      .createProgramBuilder(codeId)
      .withSalt(SALT)
      .withExecutableBalance(EXEC_BALANCE_WVARA, execDeadline, execPermit)
      .build();
    await createTx.sendAndWaitForReceipt();
    programId = (await createTx.getProgramId()) as Hex;
    console.log(`program:   ${programId}`);
  }

  // --- 4. init message (SCALE-encoded ctor, first message) -----------------
  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });
  const alreadyInit = (await mirror.nonce()) > 0n;
  if (alreadyInit) {
    console.log("program already initialized ✓ (skipping init)");
  } else {
    // verifier is an ActorId (32 bytes): map the 20-byte eth address to the
    // ActorId the runtime will see for that sender (12 zero bytes + address).
    const initPayload = encodeCtorPayload(
      ethAddressToActorId(address("verifier")),
      BOND_WEI,
      SLASH_WEI,
      SLASH_TO_REQUESTER_BPS,
    );
    const initTx = await mirror.sendMessage(initPayload, 0n);
    await initTx.sendAndWaitForReceipt();
    console.log("init message delivered ✓");
  }

  // --- record --------------------------------------------------------------
  const deployment: Deployment = {
    programId,
    codeId: codeId as Hex,
    router: ROUTER_ADDRESS,
    wvara: WVARA_ADDRESS,
    verifier: address("verifier"),
    bondWei: BOND_WEI.toString(),
    slashWei: SLASH_WEI.toString(),
    slashToRequesterBps: SLASH_TO_REQUESTER_BPS,
    deployedAt: new Date().toISOString(),
    deployTx: uploadHash as Hex,
  };
  writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`\nwrote ${DEPLOYMENTS_PATH}`);
  console.log(JSON.stringify(deployment, null, 2));

  await provider.disconnect?.();
  process.exit(0);
}

main().catch((err) => {
  console.error("deploy failed:", err);
  process.exit(1);
});
