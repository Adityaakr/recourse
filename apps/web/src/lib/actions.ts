// Wallet actions across the two lanes.
//
//   Add funds (deposit)  -> classic L1 transaction, carries ETH, costs gas.
//                           This is the ONE gas payment; value can only enter
//                           the program on the classic lane.
//   Fund job (create)    -> injected transaction, carries no value, gasless.
//                           The wallet shows a Signature request; the escrow is
//                           debited from the balance loaded by Add funds.
//
// So the "contrast must be felt" is literal: one gas prompt to load funds, then
// every job is a gasless signature. Quoting/award/grading never touch the
// wallet at all (the operators sign those).

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient, useWriteContract } from "wagmi";
import { parseEther, type Hex } from "viem";
import { encodeCall } from "@recourse/sdk/codec";
import { injectedCall, readBalance } from "./varaeth.js";

// Minimal mirror ABI — the payable sendMessage entrypoint the deposit rides.
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
  /** keccak256 of the chosen task's hidden test suite — the success criterion. */
  criteriaHash: string;
  /** Which verifier grades it: "unit-tests-v1" (code) or "json-schema-v1". */
  verifierKind: string;
}

/** Add funds: the one L1 gas payment, loading the program's internal balance. */
export function useDeposit(programId: Hex) {
  const { writeContractAsync, isPending, error, reset } = useWriteContract();

  async function deposit(amountEth: string): Promise<Hex> {
    return writeContractAsync({
      address: programId,
      abi: MIRROR_ABI,
      functionName: "sendMessage",
      args: [encodeCall("Market", "Deposit", []), false],
      value: parseEther(amountEth as `${number}`),
    });
  }

  return { deposit, isPending, error, reset };
}

/** Fund a job: a gasless injected signature that debits the internal balance. */
export function useFundJob(programId: Hex) {
  const { data: walletClient } = useWalletClient();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function fund(terms: JobTerms): Promise<{ txHash: Hex; ms: number }> {
    if (!walletClient) throw new Error("Wallet not connected");
    setPending(true);
    setError(null);
    try {
      return await injectedCall(walletClient, programId, "Market", "CreateJob", [
        parseEther(terms.escrowEth as `${number}`),
        parseEther(terms.maxPriceEth as `${number}`),
        terms.deadlineSecs,
        terms.verifierKind,
        bytes32(terms.criteriaHash as Hex),
        terms.policy,
        terms.quoteWindowSecs,
      ]);
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setPending(false);
    }
  }

  return { fund, isPending, error, reset: () => setError(null) };
}

/** The connected wallet's internal (vault-ledger) balance in wei, refreshable. */
export function useInternalBalance(programId: Hex) {
  const { address } = useAccount();
  const [balance, setBalance] = useState<bigint | null>(null);

  const refresh = useCallback(async (): Promise<bigint | null> => {
    if (!address || programId === "0x") return null;
    try {
      const b = await readBalance(programId, address);
      setBalance(b);
      return b;
    } catch {
      return null; // leave the last known value on a transient read failure
    }
  }, [address, programId]);

  // Poll so the balance stays live: a deposit is an L1 message that the program
  // processes a block or two after the tx confirms, and this is what flips the
  // button from "Add funds" (classic) to "Fund job" (gasless) once it lands.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return { balance, refresh };
}
