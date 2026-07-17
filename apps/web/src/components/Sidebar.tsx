// Left rail, identity, navigation, and the wallet. Kept honest: the nav items
// that leave the app are real external links (program on Etherscan, faucet,
// source); the in-app views switch the main content.

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { LayoutDashboard, ListChecks, Users, LineChart, ExternalLink, Droplets, Code2 as GithubIcon, Wallet, Moon, Sun } from "lucide-react";
import { hoodi } from "../lib/chain.js";
import { shortAddr } from "../lib/format.js";
import { Mono } from "./ui.js";
import type { Conn } from "../lib/api.js";

export type View = "dashboard" | "jobs" | "providers" | "analytics";

export function Sidebar({ view, onView, programId, conn, theme, onToggleTheme }: {
  view: View; onView: (v: View) => void; programId: string; conn: Conn;
  theme: "light" | "dark"; onToggleTheme: () => void;
}) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-baseline gap-2 px-5 py-5">
        <span className="text-[19px] font-bold lowercase tracking-tight text-fg" style={{ fontFamily: "Inter, sans-serif" }}>recourse</span>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        <span className="text-[10px] uppercase tracking-wider text-muted-fg">vara.eth</span>
      </div>

      <nav className="flex-1 px-3 py-2">
        <Group label="Console">
          <NavItem icon={<LayoutDashboard size={17} />} active={view === "dashboard"} onClick={() => onView("dashboard")}>Dashboard</NavItem>
          <NavItem icon={<LineChart size={17} />} active={view === "analytics"} onClick={() => onView("analytics")}>Analytics</NavItem>
          <NavItem icon={<ListChecks size={17} />} active={view === "jobs"} onClick={() => onView("jobs")}>Jobs</NavItem>
          <NavItem icon={<Users size={17} />} active={view === "providers"} onClick={() => onView("providers")}>Providers</NavItem>
        </Group>
        <Group label="Network">
          <NavLink icon={<ExternalLink size={17} />} href={`https://hoodi.etherscan.io/address/${programId}`}>Program</NavLink>
          <NavLink icon={<Droplets size={17} />} href="https://eth.vara.network/faucet">Faucet</NavLink>
          <NavLink icon={<GithubIcon size={17} />} href="https://github.com/Adityaakr/recourse">Source</NavLink>
        </Group>
      </nav>

      <div className="space-y-2 border-t p-3">
        <div className="flex items-center justify-between px-2 text-xs text-muted-fg">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${conn === "live" ? "bg-pass" : conn === "connecting" ? "bg-pending" : "bg-fail"}`} />
            {conn === "live" ? "Live on hoodi" : conn === "connecting" ? "Connecting…" : "Indexer offline"}
          </span>
          <button type="button" onClick={onToggleTheme} aria-label="Toggle theme" className="rounded-md p-1 hover:bg-muted">
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        </div>
        <WalletCard />
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ icon, active, onClick, children }: { icon: React.ReactNode; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary-ink" : "text-muted-fg hover:bg-muted hover:text-fg"
      }`}>
      {icon}{children}
    </button>
  );
}

function NavLink({ icon, href, children }: { icon: React.ReactNode; href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-fg transition-colors hover:bg-muted hover:text-fg">
      {icon}{children}
    </a>
  );
}

function WalletCard() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const injected = connectors[0];

  if (!isConnected) {
    return (
      <button type="button" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected })}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-90 disabled:opacity-50">
        <Wallet size={16} />{isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== hoodi.id) {
    return (
      <button type="button" onClick={() => switchChain({ chainId: hoodi.id })}
        className="w-full rounded-xl bg-pending px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-black hover:opacity-90">
        Switch to Hoodi
      </button>
    );
  }
  return (
    <button type="button" onClick={() => disconnect()} title="Disconnect"
      className="flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left hover:bg-muted">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-lane-injected to-primary text-white"><Wallet size={15} /></span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-fg">Connected</span>
        <Mono className="block text-sm font-medium">{shortAddr(address)}</Mono>
      </span>
    </button>
  );
}
