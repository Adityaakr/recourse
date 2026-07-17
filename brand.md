# Brand — recourse

_Status: active_

recourse is an outcome router for AI agents: it decides not just where a request
goes, but whether the provider deserves to be paid. The brand is **precise,
technical, and trustworthy** — financial-settlement infrastructure for autonomous
agents, not a consumer toy. Calm dark canvas, one confident accent, and a
disciplined two-color system that carries the product's core idea.

## The one idea the visuals must carry

Every job moves on **two lanes**, and the whole pitch is the contrast between
them. The UI encodes the lanes as color, consistently, everywhere:

- **Injected lane** — sub-second, gasless, validator-signed. Color: **cyan**
  (`--lane-injected`). Fast, electric, weightless.
- **Ethereum L1 lane** — carries value, ~12s finality. Color: **violet**
  (`--lane-l1`). Heavier, deliberate, settled.

A viewer should be able to glance at any event and know which lane it rode.

## Palette

Dark-first (the default), with a clean light theme. HSL, wired to shadcn tokens.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--background` | `222 30% 6%` | `210 20% 99%` | page canvas |
| `--card` | `222 26% 9%` | `0 0% 100%` | panels |
| `--muted` | `222 20% 14%` | `210 16% 96%` | insets, wells |
| `--border` | `222 18% 18%` | `214 20% 90%` | hairlines |
| `--foreground` | `210 20% 96%` | `222 30% 12%` | primary text |
| `--muted-foreground` | `215 15% 62%` | `215 14% 42%` | secondary text |
| `--primary` | `243 75% 66%` | `243 62% 56%` | brand indigo, actions |
| `--lane-injected` | `188 85% 55%` | `191 82% 42%` | injected-lane accent (cyan) |
| `--lane-l1` | `255 78% 74%` | `256 55% 55%` | L1-lane accent (violet) |
| `--pass` | `158 68% 50%` | `158 62% 38%` | paid / success (emerald) |
| `--fail` | `350 82% 66%` | `350 70% 50%` | refund + slash / failure (rose) |
| `--pending` | `40 92% 58%` | `36 88% 46%` | awaiting / in-flight (amber) |

Rules:
- **One brand accent** (indigo) for primary actions and focus. The lane colors are
  semantic, not decorative — never use cyan/violet for a random button.
- Outcome colors (pass/fail/pending) only ever mean the outcome. Green is paid,
  rose is refund+slash, amber is in-flight.
- Surfaces step up by lightness (`background` → `card` → elevated) — never by
  heavy borders or drop shadows. Depth is quiet.

## Typography

- **UI:** Inter (via `next/font` / `@fontsource`). Tight, neutral, legible.
- **Numbers, addresses, ms, hashes:** JetBrains Mono. Every on-chain value — a
  price, a latency, a tx hash, an ActorId — is monospaced and tabular so columns
  align and the numbers read as data.
- Scale: page title 28–32 / panel title 15 semibold / body 14 / meta 12.
- Letter-spacing: slightly tight on headings (`-0.01em`), normal on body.

## Motion

- Quiet and quick. 150–220ms, `ease-out`. Events enter with a small fade+rise;
  status changes cross-fade. Latency numbers may count up once on arrival.
- The injected lane should *feel* fast: quote cards snap in. L1 events settle in
  a touch slower, matching their real weight.
- Respect `prefers-reduced-motion` — no essential information conveyed by motion
  alone.

## Voice

- Precise and plain. "success criteria", never "accuracy". "enforced by the
  protocol", never "trustless". Say what happened: "Refunded + bond slashed", not
  "Transaction complete".
- Numbers are the story — surface the measured injected-lane ms, the price, the
  slash. Let the data talk.
