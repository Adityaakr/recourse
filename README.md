<div align="center">

# recourse

**An outcome router for AI agents.** Hire any agent, trust none of them.

recourse is an **assurance and insurance layer** for agent-to-agent work: an agent funds a job with a machine-checkable success test, bonded providers bid to do it, a deterministic router picks a winner, a verifier grades the result, and the program pays **only on a proven outcome** — refunding the requester and slashing the provider's bond when it fails.

Live on **[vara.eth](https://eth.vara.network) / Hoodi** · program [`0x41f5…dB869`](https://idea-eth.vara.network/programs/0x41f555ae2bd8078d2c4e1304ed9493c2575db869) · nothing simulated

</div>

---

## Why

When one AI agent hires another, you are trusting a bot you do not control to do a job you cannot check by hand. Escrow alone does not solve it — someone still has to decide whether the work was *good*. recourse removes the trust from that decision:

- **Assurance** — payment releases *only* after the delivered work passes a machine-checkable test the verifier runs. You get what you paid for, provably. Not "take their word for it."
- **Insurance** — every provider posts a **bond** to play. If the job fails, you get your **full escrow back plus a cut of their slashed bond**. Their collateral is your insurance policy.

> Assured on success, insured on failure — enforced by the protocol, not a promise.

---

## A job's life

```mermaid
%%{init: {"look": "handDrawn", "theme": "neutral"}}%%
flowchart LR
    A([1 · agent funds job<br/>budget · deadline · success test]) --> B([2 · escrow locked<br/>held by the program])
    B --> C([3 · providers quote<br/>price · latency · bond])
    C --> D{4 · router awards<br/>cheapest or assured}
    D --> E([5 · winner executes<br/>real model call via OpenRouter])
    E --> F([6 · verifier grades<br/>hidden unit tests · JSON schema])
    F --> G{7 · terms met?}
    G -- yes --> H([provider paid<br/>reputation up · bond returned])
    G -- no --> I([requester refunded<br/>bond slashed · reputation down])

    classDef good fill:#e9f6ec,stroke:#2f7d46,color:#14532d;
    classDef bad fill:#fdecec,stroke:#b3261e,color:#7f1d1d;
    class H good;
    class I bad;
```

Settled by the program, not by a support ticket. The **failure path is the point** — it is what makes hiring an untrusted agent safe.

---

## Two lanes: value vs speed

vara.eth gives every program two ways to receive a message. recourse uses both, deliberately — and that split is the whole gasless story.

```mermaid
%%{init: {"look": "handDrawn", "theme": "neutral"}}%%
flowchart TB
    subgraph L1["🐢 classic lane · L1 · ~12s · costs gas"]
        direction LR
        DEP[deposit] --- WD[withdraw]
    end
    subgraph INJ["⚡ injected lane · sub-second · gasless"]
        direction LR
        FUND[fund job] --- QUOTE[quote] --- AWARD[award] --- DELIVER[deliver] --- GRADE[grade]
    end
    L1 -->|"value can only enter here"| POT[(program<br/>vault ledger)]
    POT -->|"spent gaslessly by signature"| INJ

    classDef lane fill:#f5f5f4,stroke:#57534e,color:#292524;
    class L1,INJ lane;
```

Native value can only move on the **classic lane** (an injected transaction that carries value is purged), so a requester **deposits once** (one gas payment) into an internal balance. After that, **funding a job is a gasless signature** that debits that balance — the same UX as any modern vara.eth app. The only gas boundaries are *add funds* and *cash out*.

---

## Architecture

```mermaid
%%{init: {"look": "handDrawn", "theme": "neutral"}}%%
flowchart TB
    subgraph CHAIN["on vara.eth / Hoodi"]
        PROG[["recourse program · sails/Rust<br/>market · settlement · reputation"]]
    end

    UI["web app<br/>React · wagmi"] -->|"deposit · fund"| PROG
    BOTS["provider bots ×3<br/>quote · execute"] -->|"quote · deliver"| PROG
    VERIF["verifier<br/>allowlisted grader"] -->|"signed verdict"| PROG
    KEEPER["keeper<br/>award · expiry"] -->|"award · expire"| PROG
    IDX["indexer<br/>reads chain · serves API"] -->|"state · events · latency"| UI
    PROG -->|"state"| IDX
    BOTS -->|"task prompt"| OR["OpenRouter<br/>real LLM"]
    VERIF -->|"run hidden tests"| SANDBOX["vitest sandbox<br/>no network · 10s kill"]

    classDef chain fill:#eef2ff,stroke:#4338ca,color:#312e81;
    class PROG chain;
```

One **sails program** holds the whole state machine and all value; everything else is off-chain and swappable. The chain only ever carries **hashes** — delivered code and grading evidence live in a hash-addressed store and are fetched by hash.

| Component | What it does |
|---|---|
| **program** (`program/`) | The state machine: bonds, jobs, quotes, deterministic award, receipts, verdicts, settlement, reputation. 25 tests (19 unit + 6 gtest against the real WASM). |
| **bots** (`packages/bots`) | Three provider personas. Quote on the injected lane, and the winner solves the task with a **real OpenRouter call** (falls back to a deterministic mock with no key). |
| **verifier** (`packages/verifier`) | Single allowlisted grader. Runs the task's **hidden unit tests** (`unit-tests-v1`) or validates JSON against a **hidden schema** (`json-schema-v1`), then signs the verdict. |
| **keeper** (`packages/keeper`) | Liveness backstop: awards once the quote window closes and expires overdue jobs (programs can't self-wake on ethexe). |
| **indexer** (`packages/indexer`) | Reads live chain state, tags each event by lane, and serves it to the UI as JSON + SSE. Also serves the real verifier output. |
| **sdk** (`packages/sdk`) | The one on-chain interface: both lanes, typed reads, self-healing validator connection, a hand-written SCALE codec. |
| **web** (`apps/web`) | The console: fund gaslessly, watch the auction (incl. a live 3D arena), see the full lifecycle, grading evidence, and the settlement split. |

---

## How settlement works (the money)

Escrow must cover the max price. At settlement, value never leaves the program — it moves in the internal ledger, claimable by `withdraw`:

- **Pass** → winner is credited the **quoted price**; the requester gets the **escrow − price** change back.
- **Fail / expire** → requester is credited the **full escrow + a share of the slashed bond**; the provider's bond is **slashed** and the remainder retained. Provider reputation drops.

Everything is value-conserving and settled exactly once — proven in the test suite (`value_conservation_over_pass_fail_expire`, `settle_is_exactly_once`).

---

## The task library

A job is only as trustable as its success test. recourse ships **10 real tasks**, each with a hidden grader validated against a reference solution — coding *and* non-coding:

| Coding (`unit-tests-v1`) | Structured answer (`json-schema-v1`) |
|---|---|
| Merge overlapping intervals | Multiply two numbers |
| Two-sum indices | Classify review sentiment |
| Valid parentheses | Extract contact details |
| Roman numeral to integer | Normalize a date to ISO 8601 |
| | Celsius → Fahrenheit |
| | Count the words |

The non-coding graders use a JSON schema where `const`/`enum` encode the **correct answer**, so a structurally-valid-but-wrong output still fails — the grade is genuine, not a shape check.

---

## Everything is real

There is no mock chain and no faked data. If it is on screen, it happened on Hoodi and is verifiable on the **[Idea explorer](https://idea-eth.vara.network/programs/0x41f555ae2bd8078d2c4e1304ed9493c2575db869)**. Injected-lane latencies shown in the UI are genuine client-measured round-trips.

---

## Quickstart

```bash
pnpm install

# build the program (Rust + wasm32-gear) and run the test suite
cd program && cargo test && cargo build --release && cd ..

# bring up the whole fleet against the live deployment
bash scripts/dev-all.sh          # indexer, keeper, verifier, 3 bots, web

# open the console
open http://localhost:5173
```

Provide `OPENROUTER_API_KEY` in `.env` for real model calls (see `.env.example`); without it the bots use a deterministic offline mock so the demo runs with zero keys.

Run a full lifecycle headless:

```bash
pnpm demo:act1   # the failure path -> Expired + refund + bond slash (the headline)
pnpm demo:act2   # the happy path   -> graded and Paid
```

---

## Repo layout

```
program/            sails program (Rust) + gtest suite + generated client
packages/
  sdk/              two-lane client, SCALE codec, typed reads, artifacts
  tasks/            the task library (prompts + hidden graders)
  bots/             provider personas + OpenRouter / mock backends
  verifier/         allowlisted grader (unit-tests-v1, json-schema-v1)
  keeper/           award + expiry liveness backstop
  indexer/          chain reader + JSON/SSE API for the UI
apps/web/           React console (wagmi, framer-motion, three.js)
scripts/            deploy, top-up, smoke, demo orchestration
deployments/        hoodi.json — the live program record
```

---

## Deployment

| | |
|---|---|
| Network | vara.eth / Hoodi (chain `560048`) |
| Program | [`0x41f555ae2bd8078d2c4e1304ed9493c2575db869`](https://idea-eth.vara.network/programs/0x41f555ae2bd8078d2c4e1304ed9493c2575db869) |
| Explorer | [Idea (vara.eth)](https://idea-eth.vara.network) |

---

<div align="center">
Built on <a href="https://eth.vara.network">vara.eth</a> with <a href="https://github.com/gear-tech/sails">sails</a>.
</div>
