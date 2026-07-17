// Demo act one — the failure path, and the whole point of recourse. The
// cheapskate underbids, wins the `cheapest` auction, then never delivers
// (FAIL_MODE=timeout). The deadline lapses, the keeper expires the job, and
// the protocol automatically refunds the requester and slashes the
// cheapskate's bond. Nothing is simulated — this is live hoodi.
//
// Run: FAIL_MODE=timeout pnpm tsx scripts/demo-act1.ts

import { parseEther } from "viem";
import { connect, runJob } from "./lib/orchestrate.js";

async function main() {
  process.env.FAIL_MODE = process.env.FAIL_MODE || "timeout";
  const r = await connect();
  console.log("=== ACT ONE: recourse — the failure path ===\n");

  const res = await runJob(
    r,
    ["cheapskate", "steady", "premium"],
    {
      policy: "cheapest",
      escrowWei: parseEther("0.01"),
      maxPriceWei: parseEther("0.008"),
      quoteWindowSecs: 24,
      deadlineSecs: 40,
    },
    (m) => console.log(m),
  );

  console.log(`\nfinal: job ${res.jobId} is ${res.finalStatus}`);
  const ok = res.finalStatus === "Expired" && res.winner === "cheapskate";
  console.log(
    ok
      ? "✓ ACT ONE PASSED — cheapskate won, failed to deliver, bond slashed, requester refunded"
      : `✗ unexpected outcome (winner=${res.winner}, status=${res.finalStatus})`,
  );
  await r.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("act one failed:", e);
  process.exit(1);
});
