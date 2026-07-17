// Off-chain delivery. The chain only ever carries hashes (kickoff §8): a
// provider writes its output to the shared artifact store keyed by the output
// hash, submits that hash on-chain, and the verifier fetches the bytes back by
// hash. In v1 the store is a local directory; in production it is an
// S3-style blob store with the same hash-addressed contract.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toBytes, type Hex } from "viem";
import { REPO_ROOT } from "./env.js";

export const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts");

/** Store `content` and return its keccak256 hash (the on-chain output hash). */
export function putArtifact(content: string): Hex {
  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });
  const hash = keccak256(toBytes(content));
  writeFileSync(join(ARTIFACT_DIR, `${hash}.txt`), content);
  return hash;
}

/** Fetch a stored artifact by its output hash, or null if absent. */
export function getArtifact(hash: Hex): string | null {
  const path = join(ARTIFACT_DIR, `${hash}.txt`);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Write a human-readable evidence bundle (e.g. test output) and return its
 *  hash — the on-chain evidence hash for a verdict. */
export function putEvidence(jobId: number, text: string): Hex {
  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });
  const hash = keccak256(toBytes(text));
  writeFileSync(join(ARTIFACT_DIR, `evidence-${jobId}.txt`), text);
  return hash;
}
