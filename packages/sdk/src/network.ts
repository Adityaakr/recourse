// Hoodi testnet constants. Verified against the kickoff spec §1 (the
// canonical vara.eth network-endpoints + contract-addresses docs, July 2026).
// Nothing here is a guess; if any address is wrong the deploy fails loudly.

import { defineChain } from "viem";

export const HOODI_CHAIN_ID = 560048;

export const HOODI_RPC_HTTP = "https://hoodi-reth-rpc.gear-tech.io";
export const HOODI_RPC_WS = "wss://hoodi-reth-rpc.gear-tech.io/ws";

/** The vara.eth router (mirror factory + code validation) on hoodi. */
export const ROUTER_ADDRESS = "0xE549b0AfEdA978271FF7E712232B9F7f39A0b060" as const;

/** Wrapped VARA (ERC-20). Reverse gas: programs pay execution from a wVARA
 *  executable balance; code validation is charged in wVARA. */
export const WVARA_ADDRESS = "0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464" as const;

export const FAUCET_URL = "https://eth.vara.network/faucet";

export const VALIDATOR_WS = [
  "wss://vara-eth-validator-1.gear-tech.io",
  "wss://vara-eth-validator-2.gear-tech.io",
  "wss://vara-eth-validator-3.gear-tech.io",
  "wss://vara-eth-validator-4.gear-tech.io",
] as const;

export const EXPLORER_TX = (hash: string) => `https://hoodi.etherscan.io/tx/${hash}`;
export const EXPLORER_ADDRESS = (addr: string) => `https://hoodi.etherscan.io/address/${addr}`;

/** viem chain for hoodi. Writes need this defined explicitly (stock viem does
 *  not ship hoodi); see the error-log trap about missing chain on eth_send. */
export const hoodi = defineChain({
  id: HOODI_CHAIN_ID,
  name: "Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [HOODI_RPC_HTTP], webSocket: [HOODI_RPC_WS] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://hoodi.etherscan.io" },
  },
  testnet: true,
});
