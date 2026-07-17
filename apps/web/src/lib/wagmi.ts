// Wallet config — MetaMask (injected) on hoodi (chain 560048). The requester
// funds jobs and claims payouts with their own wallet; everything else is
// operated by the protocol services.

import { http, createConfig } from "wagmi";
import { hoodi } from "./chain.js";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [hoodi],
  connectors: [injected()],
  transports: { [hoodi.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
