# Brand - recourse

_Status: active_

recourse is an outcome router for AI agents: it decides not just where a request
goes, but whether the provider deserves to be paid. The interface is a dense,
professional settlement terminal. The identity is **monochrome** - built entirely
from four greys, no hue anywhere - so it reads as precise infrastructure, not a
consumer app.

## Palette (the only colours)

| Hex | Role |
|-----|------|
| `#FFFFFF` | primary text / emphasis (dark theme), page ground (light theme) |
| `#D4D4D4` | light surfaces, borders (light theme), bright data |
| `#B3B3B3` | secondary/muted text, mid-shade data |
| `#2B2B2B` | panels / ground (dark theme), primary text (light theme) |

Everything else is a value step between these. Graphite is the default theme;
paper is the light toggle. There is no accent hue - emphasis comes from value,
weight, fill-vs-outline, and position.

## Encoding meaning without colour

The two lanes and the pass/fail outcomes are distinguished by **treatment**, not
colour:

- **Injected lane** - a filled chip / solid timeline dot.
- **Ethereum L1 lane** - an outlined chip / ring timeline dot.
- **Paid** - a solid inverted chip and a filled chart bar (prominent).
- **Refunded + slashed** - a strong outline and a hollow chart bar (flagged).

## Typography

- **Data, labels, everything structural:** JetBrains Mono, tabular figures. The
  terminal is monospace-first so every price, ms, hash, and count aligns.
- **The little running prose there is:** Inter.
- Uppercase, letter-spaced labels for panel chrome; tight monospace for data.

## Layout

A tiled, gap-free terminal grid that fills the viewport: a metrics bar, then
compose + jobs / market / trace + settlement, over a status line. Dense, boxy,
sharp 1px borders, ~3px radius. No dead whitespace.

## Charts

Recharts, themed from the CSS variables so they stay monochrome and follow the
theme. Series are shades of grey; grid is faint; endpoints emphasised; tooltips
match the panel chrome. Never hand-rolled.

## Motion

Quiet and quick (150-220ms, ease-out). The one modal (job detail) uses
AnimatePresence with symmetric enter/exit. Respect `prefers-reduced-motion`.

## Voice

Precise and plain. "success criteria", never "accuracy". "enforced by the
protocol", never "trustless". No em-dashes. Say what happened: "Refunded + bond
slashed", not "Transaction complete".
