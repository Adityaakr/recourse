// unit-tests-v1: grade a delivered solution by running the task's HIDDEN
// vitest suite against it — pinned node (see .nvmrc), a 10-second hard kill,
// and no network. The chain only ever saw the output hash; the actual code is
// fetched off-chain by that hash.
//
// The sandbox is created UNDER this package so that the hidden test's
// `import { ... } from "vitest"` resolves up the tree to the verifier's own
// node_modules — and we invoke the resolved vitest binary directly (never
// `npx`, which would touch the network).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "@recourse/tasks";

export interface GradeResult {
  pass: boolean;
  evidence: string;
}

const KILL_MS = 10_000;
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VITEST_BIN = join(PKG_ROOT, "node_modules", ".bin", "vitest");
const SANDBOX_PARENT = join(PKG_ROOT, ".sandbox");

export function gradeUnitTests(solution: string, task: Task): GradeResult {
  if (!existsSync(SANDBOX_PARENT)) mkdirSync(SANDBOX_PARENT, { recursive: true });
  const dir = mkdtempSync(join(SANDBOX_PARENT, "run-"));
  try {
    // The suite imports "./solution.js"; write the delivered code there and the
    // hidden tests beside it.
    writeFileSync(join(dir, "solution.js"), solution);
    writeFileSync(join(dir, "solution.test.js"), task.testFile);
    const out = execFileSync(
      VITEST_BIN,
      ["run", "--no-color", "--reporter=basic", "--root", dir],
      {
        cwd: dir,
        timeout: KILL_MS,
        killSignal: "SIGKILL",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", CI: "1" },
      },
    );
    return { pass: true, evidence: tail(out) };
  } catch (err: unknown) {
    // Non-zero exit (test failure), timeout kill, or crash all count as a fail;
    // the evidence bundle captures why for the frontend's act-one receipt.
    const e = err as { stdout?: string; stderr?: string; signal?: string; message?: string };
    const evidence =
      e.signal === "SIGKILL" || e.signal === "SIGTERM"
        ? `killed after ${KILL_MS}ms (timeout)\n${tail(e.stdout ?? "")}`
        : tail([e.stdout, e.stderr].filter(Boolean).join("\n") || e.message || "test run failed");
    return { pass: false, evidence };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Keep the last ~2KB of output for a compact on-screen evidence bundle. */
function tail(s: string): string {
  return s.length > 2048 ? `…${s.slice(-2048)}` : s;
}
