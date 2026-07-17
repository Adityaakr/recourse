// Top up the program's executable balance (reverse-gas WVARA fuel). Without
// this the program silently stalls: messages queue on L1 but never execute.
import { createPublicClient, createWalletClient, http } from "viem";
import { createVaraEthApi, WsVaraEthProvider, getMirrorClient } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { hoodi, VALIDATOR_WS, ROUTER_ADDRESS, WVARA_ADDRESS } from "../packages/sdk/src/network.js";
import { account, readDeployment } from "../packages/sdk/src/env.js";

const d = readDeployment();
const amount = BigInt(process.argv[2] ?? "90") * 10n ** 12n; // WVARA (12-dec)
const deployer = account("deployer");
const publicClient = createPublicClient({ chain: hoodi, transport: http() });
const walletClient = createWalletClient({ account: deployer, chain: hoodi, transport: http() });
const signer = walletClientToSigner(walletClient);
const provider = new WsVaraEthProvider(VALIDATOR_WS[0]);
const api = await createVaraEthApi(provider, publicClient, ROUTER_ADDRESS, signer);

// Permit-based top-up (no separate approve tx needed).
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const { signature } = await api.eth.wvara.prepareAndSignPermitData(d.programId, amount, deadline);
const mirror = getMirrorClient({ address: d.programId, publicClient, signer });
const tx = await mirror.executableBalanceTopUpWithPermit(amount, deadline, signature);
const receipt = await tx.sendAndWaitForReceipt();
console.log(`topped up ${amount / 10n ** 12n} WVARA · tx ${receipt.transactionHash}`);
await provider.disconnect?.();
process.exit(0);
