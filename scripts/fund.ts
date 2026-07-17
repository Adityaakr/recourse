// Fan hoodi ETH from the deployer out to the service accounts so they can
// post bonds (bots), escrow jobs (requester), and pay L1 gas (keeper).
// Injected-lane-only actors (the verifier) need almost nothing but get a
// small float for headroom.
//
// Run: pnpm tsx scripts/fund.ts

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { hoodi } from "../packages/sdk/src/network.js";
import { account, address, type Role } from "../packages/sdk/src/env.js";

// Target top-up per role (idempotent: we only send the shortfall).
const TARGET: Partial<Record<Role, bigint>> = {
  requester: parseEther("0.2"),
  "bot-steady": parseEther("0.1"),
  "bot-cheapskate": parseEther("0.1"),
  "bot-premium": parseEther("0.1"),
  verifier: parseEther("0.03"),
  keeper: parseEther("0.05"),
};

async function main() {
  const deployer = account("deployer");
  const publicClient = createPublicClient({ chain: hoodi, transport: http() });
  const walletClient = createWalletClient({ account: deployer, chain: hoodi, transport: http() });

  const start = await publicClient.getBalance({ address: deployer.address });
  console.log(`deployer balance: ${formatEther(start)} ETH\n`);

  for (const [role, target] of Object.entries(TARGET) as [Role, bigint][]) {
    const to = address(role);
    const have = await publicClient.getBalance({ address: to });
    if (have >= target) {
      console.log(`${role.padEnd(16)} ${to}  has ${formatEther(have)} ETH — skip`);
      continue;
    }
    const top = target - have;
    const hash = await walletClient.sendTransaction({ to, value: top });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`${role.padEnd(16)} ${to}  +${formatEther(top)} ETH  tx ${hash}`);
  }

  const end = await publicClient.getBalance({ address: deployer.address });
  console.log(`\ndeployer balance: ${formatEther(end)} ETH`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fund failed:", err);
  process.exit(1);
});
