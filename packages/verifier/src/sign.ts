// eip-191 signed verdict. The program accepts a verdict on the basis of the
// message SOURCE being the single allowlisted verifier ActorId (checked
// on-chain), so this signature is NOT what authorizes settlement — it is a
// portable, independently-checkable attestation for the off-chain audit trail
// and the indexer's evidence bundle.

import { encodePacked, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { privateKey } from "@recourse/sdk";

export interface SignedVerdict {
  jobId: number;
  pass: boolean;
  evidenceHash: Hex;
  /** eip-191 signature over keccak256(jobId ‖ pass ‖ evidenceHash). */
  signature: Hex;
  verifier: Hex;
}

/** Digest the verifier signs — a stable commitment to the graded outcome. */
export function verdictDigest(jobId: number, pass: boolean, evidenceHash: Hex): Hex {
  return keccak256(
    encodePacked(["uint64", "bool", "bytes32"], [BigInt(jobId), pass, evidenceHash]),
  );
}

export async function signVerdict(
  jobId: number,
  pass: boolean,
  evidenceHash: Hex,
): Promise<SignedVerdict> {
  const account = privateKeyToAccount(privateKey("verifier"));
  const digest = verdictDigest(jobId, pass, evidenceHash);
  // personal_sign / eip-191 over the digest bytes.
  const signature = await account.signMessage({ message: { raw: digest } });
  return { jobId, pass, evidenceHash, signature, verifier: account.address };
}
