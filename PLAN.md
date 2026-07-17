# PLAN — recourse

Outcome router for AI agents on vara.eth (hoodi). Agents fund jobs with ETH plus a
machine-checkable success test; bonded provider bots quote sub-second on the injected
lane; the program awards deterministically; a verifier grades; the program settles.
Pay on pass. Refund plus bond slash on fail. The failure path is the demo.

Kickoff prompt is the spec of record. This file records decisions and deviations.
Project memory (evidence-cited facts, danger zones) lives in `.prism/project-model.md`.

## Milestones

- M0 — toolchain + version decision + counter validation (this file, this commit)
- M1 — the sails program: market/settlement/reputation services, full state machine,
  gtest invariant suite, sol ABI generation
- M2 — deploy to hoodi + sdk + lifecycle smoke ✓ DONE (both flows pass live)
- M3 — provider bots (3 personas) + verifier service (sandboxed vitest, node 20)
- M4 — indexer (mirror logs -> sqlite) + react/vite frontend
- M5 — demo polish: act one (failure path), act two (success path)

## Decisions

### D1 (M0): sails-rs 2.0.0, not 1.0.x
The kickoff prompt said 1.0.0; latest is 2.0.0 (2026-07-06). sails-cli 2.0.0 scaffolds
against 2.0.0 and the generated project builds and tests green (see M0 validation below).
Staying on the current major avoids building on an API the toolchain no longer emits.
Drift from the 1.0.0-beta.2-era examples we planned from:
- `#[sails_rs::sails_type]` replaces manual Encode/TypeInfo/ReflectHash derives
- `#[export(scale)]` gives a per-method SCALE-only lane (clean escape from sol-ABI
  type limits; the u8 constraint is now scoped per export)
- services hold state via `StateMut<Item = T>` generics rather than bare RefCell fields
- `Syscall::with_message_source` / `with_block_height` test shims allow off-chain
  service unit tests without gtest
- gtest: `GtestEnv::system_default()`, event streams via `client.listen()`
Reversal cost: one commit (re-pin workspace to 1.0.1 and de-drift idioms).

### D2 (M0): payouts are pull-payments, push is the fallback
`gcore::msg::send(destination, payload, value)` IS available under the ethexe feature
(sails-rs 2.0.0 `src/client/gstd_env.rs:126`), so push payouts to arbitrary actors are
API-possible. We still design payouts as internal credit + `claim()` returning
`CommandReply::with_value`: it is the demonstrated path (vault example), it makes the
recipient the caller (no unverified third-party-send behavior on the critical path),
and it matches the L1 `mirror.claimValue` UX. Push-send stays as a recorded option if
claim UX proves awkward in the demo.

### D3 (M0): ethexe CLI built from source
`get.gear.rs/ethexe` is a dead S3 key and the v2.0.0 release binary is Linux x86-64
only; this machine is macOS arm64. Building `ethexe-cli` from the gear repo at tag
v2.0.0 (background at M0; only needed at M2). If the source build fails, fallback is
deploying via the @vara-eth/api TS SDK (router uploadCode/createProgram) instead of
the CLI — decide at M2 if it comes to that.

## M0 validation results

- sails-cli 2.0.0 installed; `cargo sails new counter-check --eth` scaffolds a
  workspace pinned to sails-rs 2.0.0 (app / client / tests layout, edition 2024).
- `Syscall::block_timestamp() -> u64` exists in 2.0.0 (`src/gstd/syscalls.rs:64`).
  Hoodi wall-clock granularity still to be measured live at M2 before deadline
  parameters are locked (spec fallback: 45s windows if coarse).
- counter build green: `counter_check.{idl,wasm,opt.wasm}` in `target/wasm32-gear/release/`.
- full test suite green: 3 off-chain service unit tests (Syscall shims) + 1 gtest
  (deploy, call, event stream), 0 failures.
- `#[export(payable)]` confirmed per-method in 2.0.0 despite doc omission
  (sails-macros-core 2.0.0 `src/shared.rs:100` parses it; `payable_check()` at :444
  panics "'{fn}' accepts no value" when value hits a non-payable method).
- `cargo sails sol` works (needs the target dir to pre-exist or it errors with
  os error 2). Generated surface: EVM events, `#[export(scale)]` methods correctly
  excluded from ABI, callback arity matches the known replyOn_ trap.
- `cargo sails client-js` works (positional out path). NOTE: generated TS client
  imports @gear-js/api + sails-js, not @vara-eth/api — at M3 use it for payload
  encoding only; transport stays @vara-eth/api createInjectedTransaction.
- ethexe CLI: source build needs `protoc` (brew install protobuf done); rebuild in
  flight at M0 close. Only needed at M2; TS-SDK deploy is the fallback (D3).

## M1 results (2026-07-17)

- Program: `program/app/src/lib.rs`, ~890 logic lines. Services `market` +
  `settlement` (reputation counters live on Provider; provider/config queries
  exposed via settlement). All kickoff §5 commands, queries, events.
- Suite: 21 green (16 service-level unit tests with Syscall shims, 5 gtest
  integration against real wasm), zero warnings.
- Value-on-Err PROVEN (gtest `err_reply_returns_value_and_keeps_none`): an
  Err reply from a payable method leaves zero value with the program.
- gtest-ethexe models the mirror faithfully: program-to-user value leaves the
  program balance and does NOT credit user balances in-test (it is claimable
  on L1 via mirror.claimValue). Conservation asserted program-side; the user
  claim leg is exercised on hoodi at M2.
- Empirical ethabi constraints found (recorded in code comments):
  - `payable` methods REQUIRE the ethabi transport -> create_job params are
    SolValue-simple (enums as strings, hash as [u8;32]).
  - bool rejected in event fields (like u8) -> pass/paid are u32 in events.
  - H256 not SolValue; fine on SCALE-only exports.
  - [u8;32] event field maps to `uint8[32]` in the sol ABI, not `bytes32`
    (indexer must decode accordingly).
- `sol/Recourse.sol` + `idl/recourse.idl` checked in; all 8 spec events on
  the EVM surface.
- Deviations: start_job kept (Running is an on-camera beat); job queries live
  on market service, provider/config queries on settlement.

## M2 results (2026-07-17)

- **Program LIVE on hoodi**: `0x6a9d41b38931bd915098b8aad1cf1b395e3630f5`
  (code id `0xd2f1b0…efe9`, upload tx `0x64ef9f…c96c`). nonce=1, non-zero
  state hash, registered in router.
- **Init verified end-to-end**: `scripts/read-config.ts` reads `get_config`
  back via `calculateReplyForHandle` and the decoded config (verifier ActorId,
  bond, slash, bps) matches the deployment exactly → the full chain (blob
  upload → validate → create → SCALE init → program decode) is proven correct.
- **D3 taken**: ethexe CLI abandoned (source build hung at 0% CPU ~50min on
  litep2p; dead S3 key; linux-only release binary). Deployed via the
  @vara-eth/api TS SDK instead (`scripts/deploy.ts`). This is the recorded
  fallback and aligns with the rest of the TS stack.
- **SDK foundation** (`packages/sdk/src/`): `network.ts` (hoodi constants +
  viem chain), `env.ts` (role keys + deployment record), `codec.ts`
  (hand-written, byte-verified SCALE encoder — see D4).
- WVARA economics learned: WTVARA is 12-decimal, bridge-minted (no WETH-style
  wrap; deposit() reverts). Faucet dispenses ~1000 WVARA/request. Deploy cost:
  1000 (code validation) + 2000 (seeded executable balance). deployer funded
  to 4000 via faucet.

### D4 (M2): hand-written SCALE codec, not the generated client
`cargo sails client-js` 2.0.0 emits a client importing `sails-js-parser-idl-v2`
+ `sails-js-types`, which are NOT on npm (latest published sails-js is 1.0.0,
whose `Sails` class can't parse the v2 IDL — "types is not iterable"). Rather
than pin an unreleased toolchain, `packages/sdk/src/codec.ts` hand-builds the
16-byte v2 envelope (magic GM + version + hlen + interface_id BE + entry_id LE
+ route_id) ++ SCALE(args), byte-verified against the correct-by-construction
generated Rust client for the ctor + 3 handle methods. Reversal cost: adopt the
generated client if a matching sails-js ships. Deleted the broken generated TS
client to avoid confusion.

### Deploy gotchas banked (all in code comments / memory)
- `verifier: ActorId` needs the 20-byte eth address left-padded to 32 bytes
  (`ethAddressToActorId`); passing the raw address fails "expected 32 bytes".
- Root `package.json` must be `"type":"module"` or tsx resolves @vara-eth/api's
  `signer` subpath to a non-existent `.cjs`.
- Program-state reads (`calculateReplyForHandle`, `subscribeBestState`) go to a
  **validator** WS endpoint, NOT the Ethereum RPC (`-32601 Method not found`).
  The provider needs an explicit `await provider.connect()`. `source` is a
  20-byte address (not the 32-byte ActorId).

## Open items carried to M1/M2

- Value attached to an Err return under `#[export(payable, unwrap_result)]`: write the
  gtest FIRST at M1 (expected: Err panics the handler, gear traps, value refunds; must
  be proven, not assumed).
- Verifier auth: on-chain check is `message_source()` allowlist; eip-191 signature is
  emitted for off-chain audit only. Confirm at M3.
- `expire_job` is permissionless (anyone can call past deadline); keeper is convenience,
  not a trust assumption.
- Program address derivation from create salt: confirm at M2 deploy.
- kzg-wasm + vite compatibility: check at M4 before frontend SDK wiring.
