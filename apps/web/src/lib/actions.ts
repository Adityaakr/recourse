// Wallet write: fund a job. The requester signs a single payable call to the
// program's mirror — `sendMessage(payload, false)` with the escrow as msg.value
// — where `payload` is the SCALE-encoded create_job the program decodes. This
// is the only place the UI moves value; quoting/grading happen off it on the
// injected lane.

import { useWriteContract } from "wagmi";
import { parseEther, type Hex } from "viem";
import { encodeCall } from "@recourse/sdk/codec";
import { INTERVAL_MERGE } from "@recourse/tasks";

// Minimal mirror ABI — just the payable sendMessage entrypoint.
const MIRROR_ABI = [
  {
    type: "function", name: "sendMessage", stateMutability: "payable",
    inputs: [{ name: "payload", type: "bytes" }, { name: "callReply", type: "bool" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

function bytes32(hex: Hex): Uint8Array {
  return Uint8Array.from((hex.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
}

export interface JobTerms {
  maxPriceEth: string;
  escrowEth: string;
  deadlineSecs: number;
  quoteWindowSecs: number;
  policy: "cheapest" | "assured";
}

export function useFundJob(programId: Hex) {
  const { writeContractAsync, isPending, error, reset } = useWriteContract();

  async function fund(terms: JobTerms): Promise<Hex> {
    const payload = encodeCall("Market", "CreateJob", [
      parseEther(terms.maxPriceEth as `${number}`),
      terms.deadlineSecs,
      "unit-tests-v1",
      bytes32(INTERVAL_MERGE.criteriaHash),
      terms.policy,
      terms.quoteWindowSecs,
    ]);
    return writeContractAsync({
      address: programId,
      abi: MIRROR_ABI,
      functionName: "sendMessage",
      args: [payload, false],
      value: parseEther(terms.escrowEth as `${number}`),
    });
  }

  return { fund, isPending, error, reset };
}
