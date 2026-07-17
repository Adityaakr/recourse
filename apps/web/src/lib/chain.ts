// Hoodi chain defined with THIS app's viem instance so wagmi's Chain type
// matches (the workspace has more than one @vara-eth/viem copy; passing a Chain
// object across that boundary breaks types). Constants come from the SDK.
import { defineChain } from "viem";
import { HOODI_CHAIN_ID, HOODI_RPC_HTTP } from "@recourse/sdk/network";

export const hoodi = defineChain({
  id: HOODI_CHAIN_ID,
  name: "Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [HOODI_RPC_HTTP] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://hoodi.etherscan.io" } },
  testnet: true,
});
