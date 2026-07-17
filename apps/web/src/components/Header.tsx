import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hoodi } from "../lib/chain.js";
import { shortAddr } from "../lib/format.js";
import { Mono } from "./ui.js";
import type { Conn } from "../lib/api.js";

export function Header({ conn, theme, onToggleTheme }: {
  conn: Conn; theme: "dark" | "light"; onToggleTheme: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">recourse</h1>
          <p className="text-xs text-muted-foreground">
            Decides where a request goes — and whether the provider deserves to be paid.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <LaneLegend />
        <LiveDot conn={conn} />
        <button
          type="button" onClick={onToggleTheme} aria-label="Toggle theme"
          className="rounded-lg border p-2 text-muted-foreground hover:bg-muted"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
        <Wallet />
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30" aria-hidden>
      <span className="text-primary">◇</span>
    </div>
  );
}

function LaneLegend() {
  return (
    <div className="hidden items-center gap-3 rounded-lg border bg-card px-3 py-1.5 text-xs sm:flex">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lane-injected" /> injected</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lane-l1" /> L1</span>
    </div>
  );
}

function LiveDot({ conn }: { conn: Conn }) {
  const map = { live: ["bg-pass", "Live"], connecting: ["bg-pending", "Connecting"], error: ["bg-fail", "Offline"] } as const;
  const [dot, label] = map[conn];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
    </span>
  );
}

function Wallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const injected = connectors[0];

  if (!isConnected) {
    return (
      <button
        type="button" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected })}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== hoodi.id) {
    return (
      <button type="button" onClick={() => switchChain({ chainId: hoodi.id })}
        className="rounded-lg bg-pending px-4 py-2 text-sm font-semibold text-black hover:opacity-90">
        Switch to Hoodi
      </button>
    );
  }
  return (
    <button type="button" onClick={() => disconnect()}
      className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" title="Disconnect">
      <Mono>{shortAddr(address)}</Mono>
    </button>
  );
}
