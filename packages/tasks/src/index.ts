// The task catalog. v1 ships ONE machine-checkable coding task: interval merge.
// A task bundles everything the three actors need:
//   - `prompt`   : what an LLM provider bot is asked to produce
//   - `reference`: a correct solution, used by the deterministic `mock` backend
//   - `testFile` : the hidden vitest suite the verifier runs against delivered
//                  output; its content hash IS the on-chain criteria hash, so
//                  the chain commits to the exact grading bundle without
//                  revealing it.
//
// criteriaHash = keccak256(utf8(testFile)). The requester puts it on-chain in
// the JobSpec; the verifier maps it back to the test bundle it stores under
// verifier/criteria/<criteriaHash>/.

import { keccak256, toBytes, type Hex } from "viem";

export interface Task {
  id: string;
  title: string;
  /** Exported function the solution must define. */
  entry: string;
  prompt: string;
  reference: string;
  testFile: string;
  criteriaHash: Hex;
}

// The delivered solution must export `mergeIntervals`. Kept dependency-free so
// it runs in the verifier's no-network sandbox.
const INTERVAL_MERGE_TESTS = `import { describe, it, expect } from "vitest";
import { mergeIntervals } from "./solution.js";

describe("mergeIntervals", () => {
  it("merges overlapping intervals", () => {
    expect(mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]]))
      .toEqual([[1, 6], [8, 10], [15, 18]]);
  });
  it("merges touching intervals", () => {
    expect(mergeIntervals([[1, 4], [4, 5]])).toEqual([[1, 5]]);
  });
  it("handles unsorted input", () => {
    expect(mergeIntervals([[8, 10], [1, 3], [2, 6]])).toEqual([[1, 6], [8, 10]]);
  });
  it("handles a fully-contained interval", () => {
    expect(mergeIntervals([[1, 10], [2, 3]])).toEqual([[1, 10]]);
  });
  it("handles the empty list", () => {
    expect(mergeIntervals([])).toEqual([]);
  });
  it("leaves disjoint intervals untouched", () => {
    expect(mergeIntervals([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });
});
`;

const INTERVAL_MERGE_REFERENCE = `export function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur.slice());
  }
  return out;
}
`;

export const INTERVAL_MERGE: Task = {
  id: "interval-merge",
  title: "Merge overlapping intervals",
  entry: "mergeIntervals",
  prompt: [
    "Write a JavaScript ES module that exports a function",
    "`mergeIntervals(intervals)`. Input is an array of [start, end] number",
    "pairs. Return the array of merged intervals, sorted by start, where any",
    "overlapping or touching intervals are combined. Do not mutate the input.",
    "Output ONLY the module code — no markdown fences, no prose.",
  ].join(" "),
  reference: INTERVAL_MERGE_REFERENCE,
  testFile: INTERVAL_MERGE_TESTS,
  criteriaHash: keccak256(toBytes(INTERVAL_MERGE_TESTS)),
};

export const TASKS: Record<string, Task> = {
  [INTERVAL_MERGE.id]: INTERVAL_MERGE,
};

/** Look up a task by its on-chain criteria hash. */
export function taskByCriteria(criteriaHash: Hex): Task | undefined {
  const want = criteriaHash.toLowerCase();
  return Object.values(TASKS).find((t) => t.criteriaHash.toLowerCase() === want);
}
