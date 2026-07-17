// Demo act two — the same task, routed for assurance. With `assured` the
// router prefers a proven provider; steady (a real OpenRouter-backed solver
// when a key is set, else the deterministic reference) wins, delivers, the
// verifier's hidden tests pass, and the protocol pays out. The contrast with
// act one is the pitch: the router decides not just where a request goes, but
// whether the provider deserves to be paid.
//
// Run: pnpm tsx scripts/demo-act2.ts

import { parseEther } from "viem";
import { connect, runJob } from "./lib/orchestrate.js";

async function main() {
  // No failure injection in act two — the honest personas deliver real work.
  delete process.env.FAIL_MODE;
  const r = await connect();
  console.log("=== ACT TWO: recourse — pay on success ===\n");

  const res = await runJob(
    r,
    ["steady", "premium"],
    {
      policy: "assured",
      escrowWei: parseEther("0.01"),
      maxPriceWei: parseEther("0.008"),
      quoteWindowSecs: 24,
      deadlineSecs: 60,
    },
    (m) => console.log(m),
  );

  console.log(`\nfinal: job ${res.jobId} is ${res.finalStatus}`);
  const ok = res.finalStatus === "Paid" && res.verdictPass === true;
  console.log(
    ok
      ? `✓ ACT TWO PASSED — ${res.winner} delivered, tests passed, provider paid`
      : `✗ unexpected outcome (winner=${res.winner}, status=${res.finalStatus}, pass=${res.verdictPass})`,
  );
  await r.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("act two failed:", e);
  process.exit(1);
});
