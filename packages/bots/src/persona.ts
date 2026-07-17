// The three provider personas. One binary; env picks the persona. Pricing is a
// fraction of the job's max price; latency is the promised (not always honest)
// number the bot quotes. `cheapskate` supports demo failure injection.

import type { Task } from "@recourse/tasks";
import type { Role } from "@recourse/sdk";
import { mockSolve } from "./models/mock.js";
import { openrouterSolve } from "./models/openrouter.js";

export type PersonaName = "steady" | "cheapskate" | "premium";
export type FailMode = "timeout" | "bad_json" | "wrong_code" | "none";

export interface Persona {
  name: PersonaName;
  role: Role;
  /** Quote price as a fraction of the job's max price (must be <= 1). */
  priceFraction: number;
  /** Promised latency in ms (cheapskate overpromises). */
  promisedLatencyMs: number;
  /**
   * Produce the deliverable for a task. Returns `null` to deliberately NOT
   * deliver (the `timeout` failure mode — the bot wins but never submits a
   * receipt, so the deadline lapses and the keeper expires the job). A broken
   * string is the `bad_json` / `wrong_code` mode — delivered, but the verifier
   * grades it a fail.
   */
  solve(task: Task): Promise<string | null>;
}

const BACKEND = process.env.RECOURSE_MODEL_BACKEND ?? "mock";
const FAIL_MODE = (process.env.FAIL_MODE || "none") as FailMode;

/** Real backend for the honest personas; mock when no key/offline. */
async function realSolve(task: Task): Promise<string> {
  if (BACKEND === "openrouter" || BACKEND === "openai" || BACKEND === "anthropic") {
    return openrouterSolve(task);
  }
  return mockSolve(task);
}

/** Deliberately broken outputs for the failure demo. `timeout` returns null
 *  (the bot sandbags — never delivers — so the keeper expires the job). */
function brokenSolve(task: Task, mode: FailMode): string | null {
  switch (mode) {
    case "timeout":
      return null; // never deliver -> deadline lapses -> keeper expires
    case "bad_json":
      // Not a valid module -> import throws -> verifier fails it.
      return `this is not valid javascript {{{`;
    case "wrong_code":
      // Plausible but wrong: forgets to sort, so unsorted inputs fail.
      return `export function ${task.entry}(intervals) {
  const out = [];
  for (const cur of intervals) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur.slice());
  }
  return out;
}\n`;
    default:
      return "";
  }
}

export function makePersona(name: PersonaName): Persona {
  switch (name) {
    case "steady":
      return {
        name, role: "bot-steady",
        priceFraction: 0.7, promisedLatencyMs: 180,
        solve: realSolve,
      };
    case "premium":
      return {
        name, role: "bot-premium",
        priceFraction: 0.95, promisedLatencyMs: 240,
        solve: realSolve,
      };
    case "cheapskate":
      return {
        name, role: "bot-cheapskate",
        priceFraction: 0.3, promisedLatencyMs: 90,
        solve: async (task) =>
          FAIL_MODE === "none" ? realSolve(task) : brokenSolve(task, FAIL_MODE),
      };
  }
}
