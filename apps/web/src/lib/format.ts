// Display formatting for on-chain values. Everything here renders inside a
// `.tnum` (monospaced, tabular) span so numbers align in columns.

export function shortAddr(addr?: string | null): string {
  if (!addr) return "—";
  const a = addr.replace(/^0x0{24}/, "0x"); // collapse a padded ActorId to its address
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** wei (18-dec ETH) to a trimmed ETH string. */
export function eth(wei?: string | bigint | null, dp = 4): string {
  if (wei === null || wei === undefined) return "—";
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function ms(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`;
}

export const HOODI_TX = (h: string) => `https://hoodi.etherscan.io/tx/${h}`;
export const HOODI_ADDR = (a: string) => `https://hoodi.etherscan.io/address/${a}`;
