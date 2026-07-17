# Project model — recourse

*Updated 2026-07-17 by /prism-understand (initial creation + inline completeness-critic pass, pre-code). Repo is greenfield: only `.claude/settings.local.json` and the cloned `vara-eth-skills/` reference exist. No git repo yet.*

## What this project is

**recourse** — an outcome router for AI agents on vara.eth (hoodi testnet). Agents fund jobs with ETH + a machine-checkable success test; bonded provider bots quote sub-second on the injected lane; a deterministic on-program router awards; a verifier grades; the program settles: pay on pass, refund + bond slash on fail. Devrel showcase; the failure path (act one of the demo) is the product. Full spec lives in the kickoff prompt; PLAN.md to be written before code.

## Architecture (as specified + verified against vara-eth-skills)

- **One sails program** (Rust, `ethexe` feature), services `market` / `settlement` / `reputation`. State machine: Open → Awarded → Running → Delivered → Verified → Paid/Refunded/Expired.
- **Two lanes**: injected transactions (sub-second, value MUST be 0 — `NonZeroValue=255` purge) for quotes/receipts/verdicts/award; Ethereum L1 (~12s) for everything carrying value (fund job, register bond, payouts via claim).
- **Off-program actors**: provider bots (3 personas), single allowlisted verifier (eip-191 signed verdicts), keeper (deadline expiry — programs cannot self-wake on ethexe), indexer (mirror EVM logs → sqlite), react+vite frontend (wagmi/metamask, chain 560048).
- **Primary value architecture**: native mirror value. Fund via payable `mirror.sendMessage(payload, value)`; program reads `Syscall::message_value()`; payouts SHOULD be pull-payments (internal credit + `claim()` returning `CommandReply::with_value`) because third-party value sends are undemonstrated (see Danger zones). L1 recipients then `mirror.claimValue(claimedId)`.
- **Fallback architecture** (if native fights >½ day): escrow pattern from `vara-eth-skills/examples/escrow` — solidity adapter holds ETH, program is the brain, callbacks confirm transitions. Endorsed by skills repo as "the common safe split" (`skills/vara-eth-solidity-integrator/SKILL.md:37-43`).

## Verified facts (2026-07-17, all live-checked)

### Network (all prompt claims CONFIRMED)
- Hoodi chain id 560048; RPC `https://hoodi-reth-rpc.gear-tech.io` (+`/ws`); router `0xE549b0AfEdA978271FF7E712232B9F7f39A0b060`; wVARA `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464`; faucet `https://eth.vara.network/faucet`; validators `wss://vara-eth-validator-{1..4}.gear-tech.io`.

### Toolchain versions (prompt was stale here)
- **sails-rs latest = 2.0.0** (2026-07-06); stable 1.0.0 (05-21), 1.0.1 (06-15). Wiki still says 1.0.0; skills examples pin **1.0.0-beta.2** (`examples/vault/Cargo.toml:42`). `ethexe` feature exists in 2.0.0. **Version choice unresolved — decide at M0** (try 2.0.0 pair with sails-cli 2.0.0; fall back to 1.0.x).
- **sails-cli 2.0.0** has `client-js` subcommand (verified in crate source `src/main.rs:85`); full set: new, client-rs, client-js, idl, idl-embed, idl-extract, sol. Install: `cargo install sails-cli`.
- **@vara-eth/api latest = 0.5.2** (2026-06-19). Full prompt-claimed surface confirmed in 0.5.2 typings: `createInjectedTransaction({destination,payload,value})`, `sendAndWaitForReceipt()` (and legacy `sendAndWaitForPromise()` coexists), `receipt.validateSignature()`, purge reasons `Outdated=1 / UnknownReferenceBlock=2 / NonZeroValue=255` (`lib/api/injected/receipt.d.ts`), `VaraEthValidatorWsPool`, `api.query.program.subscribeBestState`, `api.call.program.calculateReplyForHandle`, `getMirrorClient`, `mirror.claimValue(claimedId)` (`lib/eth/contracts/mirror.contract.d.ts:60`), `mirror.executableBalanceTopUp`. Peer install: `viem@npm:@vara-eth/viem@2.47.7-1` + `kzg-wasm@1.0.0` (peerDeps are loose `viem:*` so stock viem installs without error — fork is an instruction, not enforced).
- Skills repo pins @vara-eth/api **0.3.2** — 3 minors stale; its examples use `sendAndWaitForPromise` and runtime IDL parsing. Prefer 0.5.2 + generated `client-js` clients.
- **ethexe CLI**: install `curl -L https://get.gear.rs/ethexe -o ethexe && chmod +x ethexe`, or gear release v2.0.0 asset. Subcommands: `key insert`, `tx upload/create/send-message/query`.
- Solidity mirror interface: `sendMessage(bytes payload, bool callReply) external payable returns (bytes32)` — note the `callReply` param the prompt omitted; `claimValue(bytes32)` confirmed on the wiki solidity-integration page AND in IMirror ABI (but absent from the @vara-eth/api README).

### Program-side API (from `vara-eth-skills`, sails 1.0.0-beta.2 era — recheck on 2.0.0)
- Read attached value: `Syscall::message_value()` (`examples/vault/app/src/lib.rs:74`); caller: `Syscall::message_source()` (:73).
- Send value out: `CommandReply::new(x).with_value(amount)` — **reply-to-caller only** (`examples/vault/app/src/lib.rs:124`).
- Payable: `#[export(payable)]` / `#[export(payable, unwrap_result)]`; macro implies value>0 (no redundant guard); value to non-payable **panics** (`skills/vara-eth-contract-writer/SKILL.md:98-117`).
- Events: `#[event]` enum + `Encode, TypeInfo, ReflectHash` derives, `emit_event()` (`examples/vault/app/src/lib.rs:39-57`). ABI constraint: **`u8` doesn't work on the sol path**; `i8`/`Vec<u8>`/`String`/`[u8;32]` do (`SKILL.md:130-134`). Run `cargo sails sol` early.
- Tests: sails gtest — `GtestEnv`, generated Rust client crate, `.with_value(v)`, `system.mint_to` (`examples/vault/tests/gtest.rs:104-111`).
- Cargo shape: workspace; app `features=["ethexe"]`, tests `+gtest,gclient`, build `+build`; edition 2024, rust-version 1.91; target `wasm32v1-none`; artifacts `target/wasm32-gear/release/<name>{.idl,.opt.wasm}`.
- Forbidden on ethexe: randomness, create_program, `*_with_gas`, gas reservations, signals, `wait`, **delayed wake flows** (`SKILL.md:150-179`) — this is why the keeper exists.

### Ops facts
- wVARA executable balance: 12 decimals, `approve` → `executableBalanceTopUp`; zero balance = program **silently stalls** (`playbooks/vara-eth-ethexe-cli-workflow.md:183`). No quantitative threshold guidance anywhere; measure per-message cost empirically.
- `ethexe tx` flag order: `--ethereum-rpc/--ethereum-router/--sender` BEFORE the subcommand.
- `--watch` needs subscription RPC; on HTTP, poll `cast call $ROUTER "codeState(bytes32)(uint8)" $CODE_ID` (2 = Validated) (`references/error-log.md:237-273`).
- Init message: first `send-message` with IDL-generated ctor payload; **only the initializer may send it**.

## Invariants (spec-level; enforce with gtest at M1)
- value in == value out + retained (escrow + bonds + retained slashes).
- Every transition guarded by allowed-from set; settle exactly once; expire never after Delivered.
- Quotes: only bonded providers, inside window, price ≤ max.
- Injected lane never carries value (platform-enforced: purge NonZeroValue).
- Bond must be LOCKED while a provider has any live awarded job; `withdraw_bond` must reject otherwise a provider can quote, get awarded, pull the bond, then fail with nothing at stake (critic finding, gtest at M1).
- Award must be idempotent/single-shot per job even under injected-lane retries (receipts can race).

## Danger zones (open items — verify BEFORE relying on them)
1. ~~Third-party value send~~ **RESOLVED at M0 (source-verified)**: `::gcore::msg::send(destination, payload, value)` is available and used by sails itself under `#[cfg(feature = "ethexe")]` (sails-rs 2.0.0 `src/client/gstd_env.rs:126`). Push payouts API-possible; pull-payment stays the design (D2 in PLAN.md). Live value-to-EOA behavior still needs the M2 smoke test.
2. **Block timestamp**: API exists — `Syscall::block_timestamp() -> u64` (sails-rs 2.0.0 `src/gstd/syscalls.rs:64`), plus `with_block_timestamp` test shim. Hoodi wall-clock granularity still to measure at M2.
3. **Value on Err**: `unwrap_result` panics on Err (sails-macros 2.0.0 doc + `payable_check` panics on value-to-non-payable at sails-macros-core `src/shared.rs:444`); panic should trap and refund value — gtest at M1 before trusting `create_job` validation.
4. ~~sails-rs 2.0.0 drift risk~~ **RESOLVED at M0**: counter scaffold on 2.0.0 builds + 4 tests green. Drift catalogued: `#[sails_rs::sails_type]` derives, `#[export(scale)]` lane, `StateMut` holders, `Syscall::with_*` test shims, `GtestEnv::system_default()`, `client.listen()` event streams, `Address` type. `#[export(payable)]` still per-method (parser-verified despite doc omission).
5. **claimValue has no working example anywhere** — wiki + typings only. The payout leg is the unverified frontier; the escrow-pattern fallback is the escape hatch (budget: ½ day per spec).
6. **sails-js runtime IDL parsing breaks in browser** (Node `Buffer`) — use build-time `cargo sails client-js` generated clients instead (`references/error-log.md:175-202`).
7. Frontend: define hoodi chain explicitly for viem writes; include custom errors in ABI fragments; handle `accountsChanged`/`chainChanged` by recreating session (`references/error-log.md`).

### Critic additions (inline pass, 2026-07-17)
8. **Lane race, funds vs award**: job funding arrives via L1 (~12s finality into program state) while quotes/award ride the injected lane (sub-second). The program must gate `submit_quote`/`award` on the job actually being Open in PROGRAM state, and bots must read state via `subscribeBestState`, not assume the L1 tx they saw in mempool has landed. Design the state machine so an early quote is a clean revert, not a corruption.
9. **Verifier authentication mechanism unresolved**: spec says eip-191 signed verdicts, but the simplest correct on-program check is `Syscall::message_source() == allowlisted verifier ActorId` on the injected message itself. In-program secp256k1/keccak recovery on ethexe is unverified (no example in skills repo). Decide at M1: source-check on-chain (simple, sufficient with one verifier) + eip-191 signature stored/emitted for off-chain audit only.
10. **Keeper liveness is a single point of failure**: programs cannot self-wake (no delayed wake on ethexe), so a dead keeper means expired jobs stay stuck forever. Make `expire_job` permissionless (anyone can call after deadline) so the keeper is a convenience, not a trust assumption.
11. **Program address derivation unverified**: `ethexe tx create` takes a salt; how programId/mirror address is derived (CREATE2-style?) is not documented in the skills repo. Matters for `.env` plumbing and indexer bootstrap. Confirm at M2 deploy.
12. **kzg-wasm in the browser**: @vara-eth/api peer-deps `kzg-wasm@1.0.0`; vite needs wasm-friendly config. Untested locally. Check at M4 before wiring the frontend SDK.
13. **Indexer ABI source**: mirror re-emits program events as EVM logs; decoding needs the `cargo sails sol` generated ABI. Run `sol` generation at M1 (also catches the u8 trap early) and commit the ABI artifact for the indexer.

## Conventions (adopted)
- pnpm workspace + cargo workspace side by side; layout per kickoff prompt §4.
- Every on-chain interaction through `packages/sdk`; no raw calls in components. TS strict, no `any` on exports. pino logs in services.
- Program ≤ ~1200 LoC rust; cut scope not correctness.
- UI language: "success criteria" never "accuracy"; "enforced by the protocol" never "trustless".

## Local machine state (2026-07-17, post-M0)
- Installed: rustc/cargo 1.95.0, `wasm32v1-none` ✓, node v24.14.1, pnpm 11.9.0, sails-cli 2.0.0, protobuf (brew).
- `get.gear.rs/ethexe` is a DEAD S3 key (404 NoSuchKey); release v2.0.0 `ethexe` asset is Linux x86-64 only. macOS path: `cargo install --git https://github.com/gear-tech/gear --tag v2.0.0 ethexe-cli --locked` — requires `protoc` (litep2p/prost-build). Build in flight at M0 close.
- Still missing: node 20 LTS for verifier sandbox (machine has 24; `.nvmrc` pins 20).
- CLI quirks learned: `cargo sails sol` needs `--target-dir` to already exist (os error 2 otherwise); `cargo sails client-js <idl> <out.ts>` positional; generated TS client imports @gear-js/api + sails-js (NOT @vara-eth/api) — use for payload encoding only, transport via @vara-eth/api.

## Decision log
- 2026-07-17 M0 (PLAN.md D1): sails-rs 2.0.0 adopted; counter validation green; drift catalogued.
- 2026-07-17 M0 (PLAN.md D2): payouts are pull-payments; push-send (`gcore::msg::send` w/ value) verified available as fallback.
- 2026-07-17 M0 (PLAN.md D3): ethexe CLI from source on macOS; TS-SDK deploy is the M2 fallback.

## Lessons
- (reserved for prism-retro)
