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
  /** Which verifier grades this task: hidden unit tests (code) or a JSON
   *  Schema (structured answer). Selects the on-chain verifier_kind too. */
  verifierKind: "unit-tests-v1" | "json-schema-v1";
  /** Exported function the solution must define (code tasks only). */
  entry?: string;
  prompt: string;
  /** The correct answer: reference code (code) or the exact JSON (json). Used
   *  by the offline mock backend and to self-validate the grader. */
  reference: string;
  /** For code tasks: the hidden vitest suite. For json tasks: the JSON Schema.
   *  criteriaHash commits to whichever this holds. */
  testFile: string;
  criteriaHash: Hex;
}

/** Build a json-schema task: the schema IS the success test, the reference is
 *  the exact expected answer, and the criteria hash commits to the schema. */
function jsonTask(t: {
  id: string; title: string; prompt: string; reference: unknown; schema: object;
}): Task {
  const schema = JSON.stringify(t.schema);
  return {
    id: t.id, title: t.title, verifierKind: "json-schema-v1",
    prompt: t.prompt, reference: JSON.stringify(t.reference),
    testFile: schema, criteriaHash: keccak256(toBytes(schema)),
  };
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
  verifierKind: "unit-tests-v1",
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

// ── task: two-sum ────────────────────────────────────────────────────────────
const TWO_SUM_TESTS = `import { describe, it, expect } from "vitest";
import { twoSum } from "./solution.js";

describe("twoSum", () => {
  it("finds the two indices that sum to the target", () => {
    expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);
  });
  it("works when the pair is not at the start", () => {
    expect(twoSum([3, 2, 4], 6)).toEqual([1, 2]);
  });
  it("handles duplicate values", () => {
    expect(twoSum([3, 3], 6)).toEqual([0, 1]);
  });
  it("returns the indices in ascending order", () => {
    expect(twoSum([0, 4, 3, 0], 0)).toEqual([0, 3]);
  });
  it("handles negative numbers", () => {
    expect(twoSum([-1, -2, -3, -4, -5], -8)).toEqual([2, 4]);
  });
});
`;

const TWO_SUM_REFERENCE = `export function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

export const TWO_SUM: Task = {
  id: "two-sum",
  title: "Two-sum indices",
  verifierKind: "unit-tests-v1",
  entry: "twoSum",
  prompt: [
    "Write a JavaScript ES module that exports a function `twoSum(nums, target)`.",
    "`nums` is an array of integers and `target` is an integer. Return the array",
    "of the two indices `[i, j]` (i < j) such that `nums[i] + nums[j] === target`.",
    "Exactly one solution exists and you may not use the same element twice.",
    "Output ONLY the module code — no markdown fences, no prose.",
  ].join(" "),
  reference: TWO_SUM_REFERENCE,
  testFile: TWO_SUM_TESTS,
  criteriaHash: keccak256(toBytes(TWO_SUM_TESTS)),
};

// ── task: valid parentheses ──────────────────────────────────────────────────
const VALID_PARENS_TESTS = `import { describe, it, expect } from "vitest";
import { isValid } from "./solution.js";

describe("isValid", () => {
  it("accepts a simple matched pair", () => { expect(isValid("()")).toBe(true); });
  it("accepts mixed matched brackets", () => { expect(isValid("()[]{}")).toBe(true); });
  it("accepts nested brackets", () => { expect(isValid("([{}])")).toBe(true); });
  it("rejects mismatched brackets", () => { expect(isValid("(]")).toBe(false); });
  it("rejects a wrong closing order", () => { expect(isValid("([)]")).toBe(false); });
  it("rejects an unclosed bracket", () => { expect(isValid("(")).toBe(false); });
  it("accepts the empty string", () => { expect(isValid("")).toBe(true); });
});
`;

const VALID_PARENS_REFERENCE = `export function isValid(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}
`;

export const VALID_PARENS: Task = {
  id: "valid-parens",
  title: "Valid parentheses",
  verifierKind: "unit-tests-v1",
  entry: "isValid",
  prompt: [
    "Write a JavaScript ES module that exports a function `isValid(s)`. `s` is a",
    "string containing only the characters '()[]{}'. Return `true` if every",
    "bracket is closed by the same type in the correct order, and `false`",
    "otherwise. The empty string is valid.",
    "Output ONLY the module code — no markdown fences, no prose.",
  ].join(" "),
  reference: VALID_PARENS_REFERENCE,
  testFile: VALID_PARENS_TESTS,
  criteriaHash: keccak256(toBytes(VALID_PARENS_TESTS)),
};

// ── task: roman numeral to integer ───────────────────────────────────────────
const ROMAN_TESTS = `import { describe, it, expect } from "vitest";
import { romanToInt } from "./solution.js";

describe("romanToInt", () => {
  it("converts a repeated symbol", () => { expect(romanToInt("III")).toBe(3); });
  it("handles the subtractive IV", () => { expect(romanToInt("IV")).toBe(4); });
  it("handles the subtractive IX", () => { expect(romanToInt("IX")).toBe(9); });
  it("converts LVIII", () => { expect(romanToInt("LVIII")).toBe(58); });
  it("converts MCMXCIV", () => { expect(romanToInt("MCMXCIV")).toBe(1994); });
});
`;

const ROMAN_REFERENCE = `export function romanToInt(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]];
    const next = v[s[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}
`;

export const ROMAN_TO_INT: Task = {
  id: "roman-to-int",
  title: "Roman numeral to integer",
  verifierKind: "unit-tests-v1",
  entry: "romanToInt",
  prompt: [
    "Write a JavaScript ES module that exports a function `romanToInt(s)`.",
    "`s` is a valid Roman numeral string (I, V, X, L, C, D, M). Return its",
    "integer value, honoring subtractive pairs like IV (4) and IX (9).",
    "Output ONLY the module code — no markdown fences, no prose.",
  ].join(" "),
  reference: ROMAN_REFERENCE,
  testFile: ROMAN_TESTS,
  criteriaHash: keccak256(toBytes(ROMAN_TESTS)),
};

// ── non-coding tasks: structured answer graded by a hidden JSON Schema ────────
const obj = (props: Record<string, object>, required: string[]) =>
  ({ type: "object", additionalProperties: false, required, properties: props });

export const MULTIPLY = jsonTask({
  id: "multiply", title: "Multiply two numbers",
  prompt: 'Compute 47 * 89. Output ONLY a JSON object of the exact form {"product": <integer>} with no prose and no markdown fences.',
  reference: { product: 4183 },
  schema: obj({ product: { const: 4183 } }, ["product"]),
});

export const SENTIMENT = jsonTask({
  id: "sentiment", title: "Classify review sentiment",
  prompt: 'Classify the sentiment of this review as exactly one of "positive", "negative", or "neutral". Review: "The device stopped working after a single day and support never replied." Output ONLY {"sentiment": "..."} with no prose and no markdown fences.',
  reference: { sentiment: "negative" },
  schema: obj({ sentiment: { const: "negative" } }, ["sentiment"]),
});

export const EXTRACT_CONTACT = jsonTask({
  id: "extract-contact", title: "Extract contact details",
  prompt: 'From this text, extract the email address and phone number. Text: "Reach Jane Doe at jane.doe@example.com or call 555-0142 after noon." Output ONLY {"email": "...", "phone": "..."} with no prose and no markdown fences.',
  reference: { email: "jane.doe@example.com", phone: "555-0142" },
  schema: obj({ email: { const: "jane.doe@example.com" }, phone: { const: "555-0142" } }, ["email", "phone"]),
});

export const PARSE_DATE = jsonTask({
  id: "parse-date", title: "Normalize a date to ISO 8601",
  prompt: 'Convert the date in this sentence to ISO 8601 (YYYY-MM-DD). Sentence: "The invoice is due on March 3rd, 2025." Output ONLY {"date": "YYYY-MM-DD"} with no prose and no markdown fences.',
  reference: { date: "2025-03-03" },
  schema: obj({ date: { const: "2025-03-03" } }, ["date"]),
});

export const CELSIUS_TO_F = jsonTask({
  id: "celsius-to-f", title: "Convert Celsius to Fahrenheit",
  prompt: 'Convert 100 degrees Celsius to Fahrenheit. Output ONLY {"fahrenheit": <number>} with no prose and no markdown fences.',
  reference: { fahrenheit: 212 },
  schema: obj({ fahrenheit: { const: 212 } }, ["fahrenheit"]),
});

export const WORD_COUNT = jsonTask({
  id: "word-count", title: "Count the words in a sentence",
  prompt: 'Count the number of words in this sentence: "the quick brown fox jumps over the lazy dog". Output ONLY {"count": <integer>} with no prose and no markdown fences.',
  reference: { count: 9 },
  schema: obj({ count: { const: 9 } }, ["count"]),
});

export const TASKS: Record<string, Task> = {
  [INTERVAL_MERGE.id]: INTERVAL_MERGE,
  [TWO_SUM.id]: TWO_SUM,
  [VALID_PARENS.id]: VALID_PARENS,
  [ROMAN_TO_INT.id]: ROMAN_TO_INT,
  [MULTIPLY.id]: MULTIPLY,
  [SENTIMENT.id]: SENTIMENT,
  [EXTRACT_CONTACT.id]: EXTRACT_CONTACT,
  [PARSE_DATE.id]: PARSE_DATE,
  [CELSIUS_TO_F.id]: CELSIUS_TO_F,
  [WORD_COUNT.id]: WORD_COUNT,
};

/** Look up a task by its on-chain criteria hash. */
export function taskByCriteria(criteriaHash: Hex): Task | undefined {
  const want = criteriaHash.toLowerCase();
  return Object.values(TASKS).find((t) => t.criteriaHash.toLowerCase() === want);
}
