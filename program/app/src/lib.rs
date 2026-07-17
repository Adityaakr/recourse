// recourse — outcome router for AI agents on vara.eth.
//
// One program, three concerns behind named routes: market (bonds, jobs,
// quotes, award), settlement (receipt, verdict, expiry, payout) with the
// reputation counters living on Provider records.
//
// Value model (native mirror flow, kickoff §3):
//   in : payable methods read Syscall::message_value()
//        (sails-rs 2.0.0 src/gstd/syscalls.rs:34)
//   out: third-party payouts via gstd::msg::send_bytes(dest, [], value)
//        (gstd 2.0.0 src/msg/basic.rs:530, re-exported at
//        sails-rs 2.0.0 src/gstd/mod.rs:11; no gas parameter — ethexe-safe).
//        Reply-to-caller value uses CommandReply::with_value
//        (sails-rs 2.0.0 src/gstd/mod.rs:44). Recipients claim on L1 via
//        mirror.claimValue.
//   time: Syscall::block_timestamp() -> u64, in the runtime's native unit —
//        UNIX SECONDS on ethexe/hoodi (measured live), MILLISECONDS under
//        gtest. The program is unit-agnostic: it never scales, comparing
//        `now` against `created_at + window` directly, so callers pass
//        windows/deadlines in whatever unit their environment's timestamp
//        uses (seconds on-chain; ms in gtest). (sails-rs 2.0.0 syscalls.rs:64)
#![no_std]

extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::format;
use core::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use sails_rs::gstd::msg;
use sails_rs::prelude::*;

pub type JobId = u64;

// ---------------------------------------------------------------- config

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub verifier: ActorId,
    pub bond_wei: u128,
    pub slash_wei: u128,
    pub slash_to_requester_bps: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            verifier: ActorId::zero(),
            bond_wei: 0,
            slash_wei: 0,
            slash_to_requester_bps: 0,
        }
    }
}

// ---------------------------------------------------------------- domain

#[sails_rs::sails_type]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerifierKind {
    UnitTestsV1,
    JsonSchemaV1,
}

#[sails_rs::sails_type]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Policy {
    Cheapest,
    Assured,
}

#[sails_rs::sails_type]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    Awarded,
    Running,
    Delivered,
    Verified,
    Paid,
    Refunded,
    Expired,
}

#[sails_rs::sails_type]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Paid,
    Refunded,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Provider {
    pub owner: ActorId,
    pub bond_wei: u128,
    pub jobs_won: u32,
    pub jobs_passed: u32,
    pub jobs_failed: u32,
    pub jobs_expired: u32,
    pub active_job: Option<JobId>,
    pub registered_at: u64,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JobSpec {
    pub requester: ActorId,
    pub escrow_wei: u128,
    pub max_price_wei: u128,
    pub deadline_secs: u32,
    pub verifier_kind: VerifierKind,
    pub criteria_hash: H256,
    pub policy: Policy,
    pub quote_window_secs: u32,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Quote {
    pub provider: ActorId,
    pub price_wei: u128,
    pub promised_latency_ms: u32,
    pub submitted_at: u64,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Receipt {
    pub output_hash: H256,
    pub model_tag: String,
    pub submitted_at: u64,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Verdict {
    pub pass: bool,
    pub evidence_hash: H256,
    pub verifier: ActorId,
    pub submitted_at: u64,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Job {
    pub id: JobId,
    pub spec: JobSpec,
    pub status: Status,
    pub created_at: u64,
    pub quotes: Vec<Quote>,
    pub winner: Option<ActorId>,
    pub awarded_at: Option<u64>,
    pub receipt: Option<Receipt>,
    pub verdict: Option<Verdict>,
    pub settled: Option<Outcome>,
    pub award_reason: Option<String>,
}

// ----------------------------------------------------------------- state

#[derive(Default)]
pub struct AppState {
    pub config: Config,
    pub providers: BTreeMap<ActorId, Provider>,
    pub jobs: BTreeMap<JobId, Job>,
    pub next_job_id: JobId,
    /// Slash remainder that stays locked in the program (kickoff §2: no
    /// burns or fee routing in v1). Tracked so value conservation is testable.
    pub retained_wei: u128,
}

impl AppState {
    fn job(&self, id: JobId) -> Result<&Job, String> {
        self.jobs.get(&id).ok_or_else(|| format!("job {id} not found"))
    }

    fn job_mut(&mut self, id: JobId) -> Result<&mut Job, String> {
        self.jobs
            .get_mut(&id)
            .ok_or_else(|| format!("job {id} not found"))
    }
}

fn ensure_status(job: &Job, allowed: &[Status]) -> Result<(), String> {
    if allowed.contains(&job.status) {
        return Ok(());
    }
    Err(format!(
        "job {} is {:?}; operation not allowed from this status",
        job.id, job.status
    ))
}

fn now_ms() -> u64 {
    Syscall::block_timestamp()
}

/// Completed jobs and score used by the `assured` policy and tie-breaks.
/// score = pass_rate_bps * min(completed, 10) — integer math, no floats.
fn reputation_score(p: &Provider) -> (u32, u128) {
    let completed = p.jobs_passed + p.jobs_failed + p.jobs_expired;
    if completed == 0 {
        return (0, 0);
    }
    let pass_rate_bps = (p.jobs_passed as u128) * 10_000 / (completed as u128);
    (completed, pass_rate_bps * (completed.min(10) as u128))
}

// ---------------------------------------------------------------- events

#[sails_rs::event]
#[sails_rs::sails_type]
pub enum MarketEvents {
    ProviderRegistered { provider: Address, bond_wei: u128 },
    JobCreated { job_id: u64, requester: Address, max_price_wei: u128, escrow_wei: u128 },
    QuoteSubmitted { job_id: u64, provider: Address, price_wei: u128, promised_latency_ms: u32 },
    JobAwarded { job_id: u64, winner: Address, reason: String },
}

// Field-type constraints on the ethabi event path (empirical, sails-rs
// 2.0.0): u8 and bool are rejected — pass/paid ride as u32 (1 = true).
#[sails_rs::event]
#[sails_rs::sails_type]
pub enum SettlementEvents {
    ReceiptSubmitted { job_id: u64, output_hash: [u8; 32] },
    VerdictSubmitted { job_id: u64, pass: u32 },
    JobSettled { job_id: u64, paid: u32, paid_wei: u128, refunded_wei: u128, slashed_wei: u128 },
    JobExpired { job_id: u64 },
}

// ---------------------------------------------------------------- market

pub struct Market<S: StateMut<Item = AppState, Error = Infallible> = RefCell<AppState>> {
    state: S,
}

impl<S: StateMut<Item = AppState, Error = Infallible>> Market<S> {
    pub fn new(state: S) -> Self {
        Self { state }
    }
}

#[sails_rs::service(events = MarketEvents)]
impl<S: StateMut<Item = AppState, Error = Infallible>> Market<S> {
    /// Post a bond and become a quotable provider. One provider per owner.
    #[export(payable, unwrap_result)]
    pub fn register_provider(&mut self) -> Result<(), String> {
        let owner = Syscall::message_source();
        let value = Syscall::message_value();
        let mut state = self.state.get_mut();
        if value < state.config.bond_wei {
            return Err(format!(
                "bond too small: sent {value}, need {}",
                state.config.bond_wei
            ));
        }
        if state.providers.contains_key(&owner) {
            return Err("provider already registered".into());
        }
        state.providers.insert(
            owner,
            Provider {
                owner,
                bond_wei: value,
                jobs_won: 0,
                jobs_passed: 0,
                jobs_failed: 0,
                jobs_expired: 0,
                active_job: None,
                registered_at: now_ms(),
            },
        );
        drop(state);
        self.emit_event(MarketEvents::ProviderRegistered {
            provider: Address::from(owner),
            bond_wei: value,
        })
        .unwrap();
        Ok(())
    }

    #[export(payable, unwrap_result)]
    pub fn top_up_bond(&mut self) -> Result<u128, String> {
        let owner = Syscall::message_source();
        let value = Syscall::message_value();
        let mut state = self.state.get_mut();
        let provider = state
            .providers
            .get_mut(&owner)
            .ok_or("provider not registered")?;
        provider.bond_wei = provider.bond_wei.saturating_add(value);
        Ok(provider.bond_wei)
    }

    /// Withdraw the full bond and deregister. Only with no active job.
    /// Value rides the reply to the caller (vault pattern).
    #[export(unwrap_result)]
    pub fn withdraw_bond(&mut self) -> Result<CommandReply<u128>, String> {
        let owner = Syscall::message_source();
        let mut state = self.state.get_mut();
        let provider = state.providers.get(&owner).ok_or("provider not registered")?;
        if provider.active_job.is_some() {
            return Err("provider has an active job".into());
        }
        let bond = provider.bond_wei;
        state.providers.remove(&owner);
        Ok(CommandReply::new(bond).with_value(bond))
    }

    /// Fund a job. Escrow must cover the worst case (value >= max price);
    /// at settlement the winner gets the quoted price and the difference
    /// returns to the requester.
    /// Payable requires the ethabi transport (macro-enforced), so params
    /// are SolValue-friendly: enums ride as strings, hashes as [u8; 32].
    #[export(scale, ethabi, payable, unwrap_result)]
    pub fn create_job(
        &mut self,
        max_price_wei: u128,
        deadline_secs: u32,
        verifier_kind: String,
        criteria_hash: [u8; 32],
        policy: String,
        quote_window_secs: u32,
    ) -> Result<u64, String> {
        let requester = Syscall::message_source();
        let value = Syscall::message_value();
        let verifier_kind = match verifier_kind.as_str() {
            "unit-tests-v1" => VerifierKind::UnitTestsV1,
            "json-schema-v1" => VerifierKind::JsonSchemaV1,
            other => return Err(format!("unknown verifier kind '{other}'")),
        };
        let policy = match policy.as_str() {
            "cheapest" => Policy::Cheapest,
            "assured" => Policy::Assured,
            other => return Err(format!("unknown policy '{other}'")),
        };
        let criteria_hash = H256::from(criteria_hash);
        if max_price_wei == 0 {
            return Err("max price must be positive".into());
        }
        if value < max_price_wei {
            return Err(format!(
                "escrow {value} does not cover max price {max_price_wei}"
            ));
        }
        if deadline_secs == 0 || quote_window_secs == 0 {
            return Err("deadline and quote window must be positive".into());
        }
        let mut state = self.state.get_mut();
        let id = state.next_job_id;
        state.next_job_id += 1;
        state.jobs.insert(
            id,
            Job {
                id,
                spec: JobSpec {
                    requester,
                    escrow_wei: value,
                    max_price_wei,
                    deadline_secs,
                    verifier_kind,
                    criteria_hash,
                    policy,
                    quote_window_secs,
                },
                status: Status::Open,
                created_at: now_ms(),
                quotes: Vec::new(),
                winner: None,
                awarded_at: None,
                receipt: None,
                verdict: None,
                settled: None,
                award_reason: None,
            },
        );
        drop(state);
        self.emit_event(MarketEvents::JobCreated {
            job_id: id,
            requester: Address::from(requester),
            max_price_wei,
            escrow_wei: value,
        })
        .unwrap();
        Ok(id)
    }

    /// Quote on an open job. Injected-lane method: never carries value.
    #[export(unwrap_result)]
    pub fn submit_quote(
        &mut self,
        job_id: u64,
        price_wei: u128,
        promised_latency_ms: u32,
    ) -> Result<(), String> {
        let provider_id = Syscall::message_source();
        let now = now_ms();
        let mut state = self.state.get_mut();
        let provider = state
            .providers
            .get(&provider_id)
            .ok_or("provider not registered")?;
        if provider.active_job.is_some() {
            return Err("provider is busy with an active job".into());
        }
        // Bond floor: slashing only ever lowers a bond, so a provider that
        // has been slashed below the registration threshold is
        // under-collateralized and must top up before quoting again. Without
        // this a slashed-to-zero provider would keep winning risk-free.
        if provider.bond_wei < state.config.bond_wei {
            return Err(format!(
                "bond {} below required {}; top up to quote",
                provider.bond_wei, state.config.bond_wei
            ));
        }
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Open])?;
        // A requester must not quote its own job: it would round-trip its own
        // escrow at zero cost while farming reputation.
        if provider_id == job.spec.requester {
            return Err("requester cannot quote its own job".into());
        }
        if now > job.created_at + job.spec.quote_window_secs as u64 {
            return Err("quote window has closed".into());
        }
        if price_wei > job.spec.max_price_wei {
            return Err(format!(
                "price {price_wei} above max {}",
                job.spec.max_price_wei
            ));
        }
        if job.quotes.iter().any(|q| q.provider == provider_id) {
            return Err("provider already quoted this job".into());
        }
        let job = state.job_mut(job_id)?;
        job.quotes.push(Quote {
            provider: provider_id,
            price_wei,
            promised_latency_ms,
            submitted_at: now,
        });
        drop(state);
        self.emit_event(MarketEvents::QuoteSubmitted {
            job_id,
            provider: Address::from(provider_id),
            price_wei,
            promised_latency_ms,
        })
        .unwrap();
        Ok(())
    }

    /// Award after the quote window closes. Callable by anyone (frontend
    /// calls it, keeper is the backstop). Deterministic and explainable:
    /// the reason (policy + losing quote indices) is stored on the job.
    /// With no valid quotes the job expires and escrow is refunded.
    #[export(unwrap_result)]
    pub fn award_job(&mut self, job_id: u64) -> Result<(), String> {
        let now = now_ms();
        let mut state = self.state.get_mut();
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Open])?;
        if now <= job.created_at + job.spec.quote_window_secs as u64 {
            return Err("quote window still open".into());
        }
        let policy = job.spec.policy;

        // A quote is valid at award time only if its provider is still idle
        // AND still bonded at or above the floor (it may have withdrawn, won
        // another job, or been slashed below the floor since quoting).
        // (index, quote, completed_jobs, score)
        let bond_floor = state.config.bond_wei;
        let candidates: Vec<(usize, Quote, u32, u128)> = job
            .quotes
            .iter()
            .enumerate()
            .filter_map(|(i, q)| {
                state.providers.get(&q.provider).and_then(|p| {
                    (p.active_job.is_none() && p.bond_wei >= bond_floor).then(|| {
                        let (completed, score) = reputation_score(p);
                        (i, q.clone(), completed, score)
                    })
                })
            })
            .collect();

        if candidates.is_empty() {
            let (requester, escrow) = {
                let job = state.job_mut(job_id)?;
                job.status = Status::Expired;
                job.settled = Some(Outcome::Refunded);
                job.award_reason = Some("no valid quotes at award; escrow refunded".into());
                (job.spec.requester, job.spec.escrow_wei)
            };
            send_value(requester, escrow);
            drop(state);
            self.emit_event(MarketEvents::JobAwarded {
                job_id,
                winner: Address::from(ActorId::zero()),
                reason: "no valid quotes at award; escrow refunded".into(),
            })
            .unwrap();
            return Ok(());
        }

        // cheapest: lowest price, ties by reputation score then arrival.
        // assured : highest score among providers with >=1 completed job,
        //           ties by price then arrival; nobody has history ->
        //           fall back to cheapest (kickoff §2 routing rule 3).
        let use_assured = policy == Policy::Assured && candidates.iter().any(|c| c.2 >= 1);
        let best = if use_assured {
            candidates
                .iter()
                .filter(|c| c.2 >= 1)
                .min_by(|a, b| {
                    b.3.cmp(&a.3)
                        .then(a.1.price_wei.cmp(&b.1.price_wei))
                        .then(a.0.cmp(&b.0))
                })
                .expect("non-empty by construction")
        } else {
            candidates
                .iter()
                .min_by(|a, b| {
                    a.1.price_wei
                        .cmp(&b.1.price_wei)
                        .then(b.3.cmp(&a.3))
                        .then(a.0.cmp(&b.0))
                })
                .expect("non-empty by construction")
        };
        let winner = best.1.provider;
        let losers: Vec<String> = candidates
            .iter()
            .filter(|c| c.0 != best.0)
            .map(|c| format!("#{}", c.0))
            .collect();
        let policy_label = match (policy, use_assured) {
            (Policy::Assured, true) => "assured",
            (Policy::Assured, false) => "assured (no history; price fallback)",
            (Policy::Cheapest, _) => "cheapest",
        };
        let reason = format!(
            "{policy_label}: quote #{} at {} wei won{}; losing quotes [{}]",
            best.0,
            best.1.price_wei,
            if use_assured {
                format!(" (score {})", best.3)
            } else {
                String::new()
            },
            losers.join(", "),
        );

        let job = state.job_mut(job_id)?;
        job.status = Status::Awarded;
        job.winner = Some(winner);
        job.awarded_at = Some(now);
        job.award_reason = Some(reason.clone());
        let provider = state
            .providers
            .get_mut(&winner)
            .expect("winner filtered as bonded");
        provider.active_job = Some(job_id);
        provider.jobs_won += 1;
        drop(state);
        self.emit_event(MarketEvents::JobAwarded {
            job_id,
            winner: Address::from(winner),
            reason,
        })
        .unwrap();
        Ok(())
    }

    /// Winner acknowledges the award. Optional on-camera beat between
    /// Awarded and Delivered.
    #[export(unwrap_result)]
    pub fn start_job(&mut self, job_id: u64) -> Result<(), String> {
        let caller = Syscall::message_source();
        let mut state = self.state.get_mut();
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Awarded])?;
        if job.winner != Some(caller) {
            return Err("only the winner can start the job".into());
        }
        state.job_mut(job_id)?.status = Status::Running;
        Ok(())
    }

    // ------------------------------------------------------- queries

    #[export(scale)]
    pub fn get_job(&self, job_id: u64) -> Option<Job> {
        self.state.get().jobs.get(&job_id).cloned()
    }

    #[export(scale)]
    pub fn list_jobs(&self, status: Option<Status>, cursor: u64, limit: u32) -> Vec<Job> {
        let limit = limit.min(50) as usize;
        self.state
            .get()
            .jobs
            .range(cursor..)
            .filter(|(_, j)| status.is_none_or(|s| j.status == s))
            .take(limit)
            .map(|(_, j)| j.clone())
            .collect()
    }
}

// ------------------------------------------------------------ settlement

pub struct Settlement<S: StateMut<Item = AppState, Error = Infallible> = RefCell<AppState>> {
    state: S,
}

impl<S: StateMut<Item = AppState, Error = Infallible>> Settlement<S> {
    pub fn new(state: S) -> Self {
        Self { state }
    }
}

#[sails_rs::service(events = SettlementEvents)]
impl<S: StateMut<Item = AppState, Error = Infallible>> Settlement<S> {
    /// Winner delivers. The program stamps time itself; a receipt past the
    /// deadline is rejected so delivery and expiry cannot race.
    #[export(scale, unwrap_result)]
    pub fn submit_receipt(
        &mut self,
        job_id: u64,
        output_hash: H256,
        model_tag: String,
    ) -> Result<(), String> {
        let caller = Syscall::message_source();
        let now = now_ms();
        let mut state = self.state.get_mut();
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Awarded, Status::Running])?;
        if job.winner != Some(caller) {
            return Err("only the winner can submit a receipt".into());
        }
        let deadline_ms = job.awarded_at.expect("awarded job has awarded_at")
            + job.spec.deadline_secs as u64;
        if now > deadline_ms {
            return Err("deadline passed; job is expirable".into());
        }
        let job = state.job_mut(job_id)?;
        job.receipt = Some(Receipt {
            output_hash,
            model_tag,
            submitted_at: now,
        });
        job.status = Status::Delivered;
        drop(state);
        self.emit_event(SettlementEvents::ReceiptSubmitted {
            job_id,
            output_hash: output_hash.to_fixed_bytes(),
        })
        .unwrap();
        Ok(())
    }

    /// Allowlisted verifier grades the delivery; settlement runs inline.
    #[export(scale, unwrap_result)]
    pub fn submit_verdict(
        &mut self,
        job_id: u64,
        pass: bool,
        evidence_hash: H256,
    ) -> Result<(), String> {
        let caller = Syscall::message_source();
        let now = now_ms();
        let mut state = self.state.get_mut();
        if caller != state.config.verifier {
            return Err("only the configured verifier may submit verdicts".into());
        }
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Delivered])?;
        let job = state.job_mut(job_id)?;
        job.verdict = Some(Verdict {
            pass,
            evidence_hash,
            verifier: caller,
            submitted_at: now,
        });
        job.status = Status::Verified;
        let how = if pass { SettleAs::Pass } else { SettleAs::Fail };
        let settlement = settle(&mut state, job_id, how)?;
        drop(state);
        self.emit_event(SettlementEvents::VerdictSubmitted {
            job_id,
            pass: pass as u32,
        })
        .unwrap();
        self.emit_settled(job_id, settlement);
        Ok(())
    }

    /// Anyone can expire an overdue job (keeper is the usual caller, but
    /// liveness must not depend on it). Terminal; counts as a fail.
    #[export(unwrap_result)]
    pub fn expire_job(&mut self, job_id: u64) -> Result<(), String> {
        let now = now_ms();
        let mut state = self.state.get_mut();
        let job = state.job(job_id)?;
        ensure_status(job, &[Status::Awarded, Status::Running])?;
        let deadline_ms = job.awarded_at.expect("awarded job has awarded_at")
            + job.spec.deadline_secs as u64;
        if now <= deadline_ms {
            return Err("job is not past its deadline".into());
        }
        let settlement = settle(&mut state, job_id, SettleAs::Expire)?;
        drop(state);
        self.emit_event(SettlementEvents::JobExpired { job_id })
            .unwrap();
        self.emit_settled(job_id, settlement);
        Ok(())
    }

    // ------------------------------------------------------- queries

    #[export(scale)]
    pub fn get_provider(&self, actor: ActorId) -> Option<Provider> {
        self.state.get().providers.get(&actor).cloned()
    }

    #[export(scale)]
    pub fn list_providers(&self) -> Vec<Provider> {
        self.state.get().providers.values().cloned().collect()
    }

    #[export(scale)]
    pub fn get_config(&self) -> Config {
        self.state.get().config.clone()
    }

    #[export]
    pub fn get_retained_wei(&self) -> u128 {
        self.state.get().retained_wei
    }

    /// Not exported (non-pub): the JobSettled emit shared by verdict and
    /// expiry paths. Lives inside the #[service] block because emit_event
    /// only exists on the generated exposure.
    fn emit_settled(&mut self, job_id: u64, s: Settled) {
        self.emit_event(SettlementEvents::JobSettled {
            job_id,
            paid: s.paid as u32,
            paid_wei: s.paid_wei,
            refunded_wei: s.refunded_wei,
            slashed_wei: s.slashed_wei,
        })
        .unwrap();
    }
}

enum SettleAs {
    Pass,
    Fail,
    Expire,
}

pub struct Settled {
    pub paid: bool,
    pub paid_wei: u128,
    pub refunded_wei: u128,
    pub slashed_wei: u128,
}

/// The only place value leaves the program besides withdraw_bond. Every
/// path frees the provider and settles exactly once (`settled` is checked
/// here and status guards upstream make re-entry impossible).
///
/// State mutations and outgoing value messages are atomic per execution:
/// a trap after queueing drops the queued messages along with the state
/// changes, so there is no partial-settlement window.
fn settle(state: &mut AppState, job_id: JobId, how: SettleAs) -> Result<Settled, String> {
    let job = state.job(job_id)?;
    if job.settled.is_some() {
        return Err("job already settled".into());
    }
    let winner_id = job.winner.expect("settle requires an awarded job");
    let requester = job.spec.requester;
    let escrow = job.spec.escrow_wei;
    let price = job
        .quotes
        .iter()
        .find(|q| q.provider == winner_id)
        .expect("winner always has a quote")
        .price_wei;

    let (outcome, status, settled) = match how {
        SettleAs::Pass => {
            // Pay the quoted price; the escrow difference returns home.
            send_value(winner_id, price);
            let change = escrow - price; // escrow >= max_price >= price
            send_value(requester, change);
            (
                Outcome::Paid,
                Status::Paid,
                Settled {
                    paid: true,
                    paid_wei: price,
                    refunded_wei: change,
                    slashed_wei: 0,
                },
            )
        }
        SettleAs::Fail | SettleAs::Expire => {
            // Full refund plus the requester's share of the bond slash;
            // the remainder of the slash stays locked in the program.
            let provider = state
                .providers
                .get_mut(&winner_id)
                .expect("active provider exists");
            let slash = state.config.slash_wei.min(provider.bond_wei);
            provider.bond_wei -= slash;
            let to_requester = slash * (state.config.slash_to_requester_bps as u128) / 10_000;
            state.retained_wei += slash - to_requester;
            send_value(requester, escrow + to_requester);
            let status = if matches!(how, SettleAs::Expire) {
                Status::Expired
            } else {
                Status::Refunded
            };
            (
                Outcome::Refunded,
                status,
                Settled {
                    paid: false,
                    paid_wei: 0,
                    refunded_wei: escrow + to_requester,
                    slashed_wei: slash,
                },
            )
        }
    };

    let provider = state
        .providers
        .get_mut(&winner_id)
        .expect("active provider exists");
    provider.active_job = None;
    match how {
        SettleAs::Pass => provider.jobs_passed += 1,
        SettleAs::Fail => provider.jobs_failed += 1,
        SettleAs::Expire => provider.jobs_expired += 1,
    }

    let job = state.job_mut(job_id)?;
    job.status = status;
    job.settled = Some(outcome);
    Ok(settled)
}

/// Third-party value send. Verified: gstd 2.0.0 `msg::send_bytes` carries
/// value and takes no gas parameter (src/msg/basic.rs:530) — allowed on
/// ethexe. On L1 the recipient claims via mirror.claimValue. No-op off
/// wasm so service-level unit tests can drive settlement directly.
fn send_value(to: ActorId, value: u128) {
    if value == 0 {
        return;
    }
    #[cfg(target_arch = "wasm32")]
    msg::send_bytes(to, [], value).expect("value send failed");
    #[cfg(not(target_arch = "wasm32"))]
    let _ = (to, value);
}

// --------------------------------------------------------------- program

pub struct Program {
    state: RefCell<AppState>,
}

#[sails_rs::program]
impl Program {
    /// Deploy-time config: the allowlisted verifier and the economics
    /// constants. No admin key over settled outcomes — no method can
    /// touch a settled job.
    pub fn create(
        verifier: ActorId,
        bond_wei: u128,
        slash_wei: u128,
        slash_to_requester_bps: u32,
    ) -> Self {
        assert!(slash_to_requester_bps <= 10_000, "bps must be <= 10000");
        Self {
            state: RefCell::new(AppState {
                config: Config {
                    verifier,
                    bond_wei,
                    slash_wei,
                    slash_to_requester_bps,
                },
                ..Default::default()
            }),
        }
    }

    pub fn market(&self) -> Market<&RefCell<AppState>> {
        Market::new(&self.state)
    }

    pub fn settlement(&self) -> Settlement<&RefCell<AppState>> {
        Settlement::new(&self.state)
    }
}

// ------------------------------------------------------------------ tests

#[cfg(test)]
mod tests {
    use super::*;
    use sails_rs::gstd::services::Service as _;

    const BOND: u128 = 20_000;
    const SLASH: u128 = 10_000;
    const BPS: u32 = 5_000; // 50% of the slash goes to the requester

    const VERIFIER: u64 = 900;
    const REQUESTER: u64 = 100;
    const PROV_A: u64 = 201;
    const PROV_B: u64 = 202;
    const PROV_C: u64 = 203;

    fn state() -> RefCell<AppState> {
        RefCell::new(AppState {
            config: Config {
                verifier: ActorId::from(VERIFIER),
                bond_wei: BOND,
                slash_wei: SLASH,
                slash_to_requester_bps: BPS,
            },
            ..Default::default()
        })
    }

    fn as_actor(actor: u64, value: u128, at_ms: u64) {
        Syscall::with_message_source(ActorId::from(actor));
        Syscall::with_message_value(value);
        Syscall::with_block_timestamp(at_ms);
    }

    macro_rules! market {
        ($s:expr) => {
            Market::new($s).expose(0)
        };
    }

    macro_rules! settlement {
        ($s:expr) => {
            Settlement::new($s).expose(0)
        };
    }

    fn register(s: &RefCell<AppState>, actor: u64) {
        as_actor(actor, BOND, 0);
        market!(s).register_provider().unwrap();
    }

    /// Open a standard job. Windows are expressed in the unit-test clock's
    /// unit (these tests set `block_timestamp` in ms via the Syscall shim),
    /// so a 10-"second" window is 10_000 and a 30-"second" deadline is
    /// 30_000. The program does not scale — see the module time note.
    /// max price 1000, escrow 1500, cheapest policy. Returns the job id.
    fn open_job(s: &RefCell<AppState>, policy: &str) -> u64 {
        as_actor(REQUESTER, 1_500, 1_000);
        market!(s)
            .create_job(1_000, 30_000, "unit-tests-v1".into(), [7u8; 32], policy.into(), 10_000)
            .unwrap()
    }

    fn quote(s: &RefCell<AppState>, actor: u64, job: u64, price: u128, at_ms: u64) {
        as_actor(actor, 0, at_ms);
        market!(s).submit_quote(job, price, 500).unwrap();
    }

    /// Drive a job to Awarded with providers A (price 800) and B (price 900).
    fn awarded_job(s: &RefCell<AppState>) -> u64 {
        register(s, PROV_A);
        register(s, PROV_B);
        let job = open_job(s, "cheapest");
        quote(s, PROV_A, job, 800, 2_000);
        quote(s, PROV_B, job, 900, 2_000);
        as_actor(REQUESTER, 0, 12_000); // window (10s from t=1s) elapsed
        market!(s).award_job(job).unwrap();
        job
    }

    fn deliver(s: &RefCell<AppState>, job: u64) {
        as_actor(PROV_A, 0, 20_000);
        settlement!(s)
            .submit_receipt(job, H256::from([9u8; 32]), "mock".into())
            .unwrap();
    }

    // ----------------------------------------------------- registration

    #[test]
    fn register_records_bond_and_rejects_small_or_duplicate() {
        let s = state();
        as_actor(PROV_A, BOND - 1, 0);
        assert!(market!(&s).register_provider().unwrap_err().contains("bond too small"));

        register(&s, PROV_A);
        let p = settlement!(&s).get_provider(ActorId::from(PROV_A)).unwrap();
        assert_eq!(p.bond_wei, BOND);

        as_actor(PROV_A, BOND, 0);
        assert!(market!(&s).register_provider().unwrap_err().contains("already registered"));
    }

    #[test]
    fn top_up_adds_and_requires_registration() {
        let s = state();
        register(&s, PROV_A);
        as_actor(PROV_A, 5_000, 0);
        assert_eq!(market!(&s).top_up_bond().unwrap(), BOND + 5_000);
        as_actor(PROV_B, 5_000, 0);
        assert!(market!(&s).top_up_bond().is_err());
    }

    #[test]
    fn withdraw_returns_bond_only_when_idle() {
        let s = state();
        let job = awarded_job(&s);
        as_actor(PROV_A, 0, 13_000);
        assert!(market!(&s).withdraw_bond().err().unwrap().contains("active job"));

        // B lost the award, so B is idle and may leave.
        as_actor(PROV_B, 0, 13_000);
        let (bond, _) = market!(&s).withdraw_bond().map(CommandReply::to_tuple).unwrap();
        assert_eq!(bond, BOND);
        assert!(settlement!(&s).get_provider(ActorId::from(PROV_B)).is_none());
        let _ = job;
    }

    // ------------------------------------------------------------- jobs

    #[test]
    fn create_job_validates_escrow_terms_and_enums() {
        let s = state();
        as_actor(REQUESTER, 999, 0); // escrow below max price
        assert!(market!(&s)
            .create_job(1_000, 30, "unit-tests-v1".into(), [0u8; 32], "cheapest".into(), 10)
            .unwrap_err()
            .contains("does not cover"));

        as_actor(REQUESTER, 1_500, 0);
        assert!(market!(&s)
            .create_job(1_000, 0, "unit-tests-v1".into(), [0u8; 32], "cheapest".into(), 10)
            .is_err());
        assert!(market!(&s)
            .create_job(1_000, 30, "unit-tests-v1".into(), [0u8; 32], "balanced".into(), 10)
            .unwrap_err()
            .contains("unknown policy"));
        assert!(market!(&s)
            .create_job(1_000, 30, "tee-v9".into(), [0u8; 32], "cheapest".into(), 10)
            .unwrap_err()
            .contains("unknown verifier kind"));

        let id = market!(&s)
            .create_job(1_000, 30, "unit-tests-v1".into(), [0u8; 32], "cheapest".into(), 10)
            .unwrap();
        let job = market!(&s).get_job(id).unwrap();
        assert_eq!(job.status, Status::Open);
        assert_eq!(job.spec.escrow_wei, 1_500);
    }

    // ----------------------------------------------------------- quotes

    #[test]
    fn slashed_below_floor_provider_cannot_requote_until_topped_up() {
        // C1 regression: a provider slashed below the registration bond is
        // under-collateralized and must be barred from quoting/winning until
        // it tops up.
        let s = state();
        let job = awarded_job(&s); // A wins at price 800
        deliver(&s, job);
        as_actor(VERIFIER, 0, 21_000);
        settlement!(&s).submit_verdict(job, false, H256::zero()).unwrap(); // A slashed 10k -> bond 10k (< 20k floor)

        // A is idle again but under-collateralized: quoting must reject.
        let job2 = open_job(&s, "cheapest");
        as_actor(PROV_A, 0, 2_000);
        assert!(market!(&s)
            .submit_quote(job2, 700, 1)
            .unwrap_err()
            .contains("below required"));

        // Even if A somehow has a stale quote, award must not pick it. Build
        // a job where A quoted while bonded, then got slashed on another job.
        // Here we assert the simpler contract: after topping back to the
        // floor, A can quote again.
        as_actor(PROV_A, BOND - (BOND - SLASH), 0); // top up 10k back to 20k
        market!(&s).top_up_bond().unwrap();
        as_actor(PROV_A, 0, 3_000);
        market!(&s).submit_quote(job2, 700, 1).unwrap();
    }

    #[test]
    fn requester_cannot_quote_own_job() {
        // S1 regression: a requester that is also a provider must not quote
        // its own job (reputation self-dealing / escrow round-trip).
        let s = state();
        as_actor(REQUESTER, BOND, 0);
        market!(&s).register_provider().unwrap();
        let job = open_job(&s, "cheapest");
        as_actor(REQUESTER, 0, 2_000);
        assert!(market!(&s)
            .submit_quote(job, 500, 1)
            .unwrap_err()
            .contains("own job"));
    }

    #[test]
    fn quote_guards_bond_window_price_duplicates_and_busy() {
        let s = state();
        register(&s, PROV_A);
        let job = open_job(&s, "cheapest");

        as_actor(PROV_B, 0, 2_000); // unbonded
        assert!(market!(&s).submit_quote(job, 800, 1).is_err());

        as_actor(PROV_A, 0, 2_000);
        assert!(market!(&s).submit_quote(job, 1_001, 1).unwrap_err().contains("above max"));

        quote(&s, PROV_A, job, 800, 2_000);
        as_actor(PROV_A, 0, 3_000);
        assert!(market!(&s).submit_quote(job, 700, 1).unwrap_err().contains("already quoted"));

        // window: created at t=1s, 10s window -> closed after t=11s
        register(&s, PROV_B);
        as_actor(PROV_B, 0, 11_001);
        assert!(market!(&s).submit_quote(job, 700, 1).unwrap_err().contains("window has closed"));

        // busy: A wins this job, then cannot quote elsewhere
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(job).unwrap();
        let job2 = open_job(&s, "cheapest");
        as_actor(PROV_A, 0, 12_500);
        assert!(market!(&s).submit_quote(job2, 800, 1).unwrap_err().contains("busy"));
    }

    // ------------------------------------------------------------ award

    #[test]
    fn award_respects_window_and_status() {
        let s = state();
        register(&s, PROV_A);
        let job = open_job(&s, "cheapest");
        quote(&s, PROV_A, job, 800, 2_000);

        as_actor(REQUESTER, 0, 5_000);
        assert!(market!(&s).award_job(job).unwrap_err().contains("window still open"));

        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(job).unwrap();
        assert!(market!(&s).award_job(job).is_err()); // double award

        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.status, Status::Awarded);
        assert_eq!(j.winner, Some(ActorId::from(PROV_A)));
        assert!(j.award_reason.unwrap().starts_with("cheapest"));
        assert_eq!(
            settlement!(&s).get_provider(ActorId::from(PROV_A)).unwrap().active_job,
            Some(job)
        );
    }

    #[test]
    fn award_cheapest_picks_lowest_price_ties_by_reputation() {
        let s = state();
        register(&s, PROV_A);
        register(&s, PROV_B);
        register(&s, PROV_C);
        // Give B one passed job of history.
        {
            let mut st = s.borrow_mut();
            let p = st.providers.get_mut(&ActorId::from(PROV_B)).unwrap();
            p.jobs_passed = 1;
        }
        let job = open_job(&s, "cheapest");
        quote(&s, PROV_A, job, 800, 2_000);
        quote(&s, PROV_B, job, 800, 2_100); // same price, better reputation
        quote(&s, PROV_C, job, 900, 2_200);
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(job).unwrap();
        assert_eq!(market!(&s).get_job(job).unwrap().winner, Some(ActorId::from(PROV_B)));
    }

    #[test]
    fn award_assured_picks_best_score_and_falls_back_to_price() {
        let s = state();
        register(&s, PROV_A);
        register(&s, PROV_B);
        register(&s, PROV_C);
        {
            let mut st = s.borrow_mut();
            // A: 1/2 passed (score 5000*2). B: 3/3 passed (score 10000*3).
            let a = st.providers.get_mut(&ActorId::from(PROV_A)).unwrap();
            a.jobs_passed = 1;
            a.jobs_failed = 1;
            let b = st.providers.get_mut(&ActorId::from(PROV_B)).unwrap();
            b.jobs_passed = 3;
        }
        let job = open_job(&s, "assured");
        quote(&s, PROV_A, job, 500, 2_000); // cheapest but weak history
        quote(&s, PROV_B, job, 900, 2_100); // pricey but proven
        quote(&s, PROV_C, job, 400, 2_200); // rookie: ineligible for assured
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(job).unwrap();
        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.winner, Some(ActorId::from(PROV_B)));
        assert!(j.award_reason.unwrap().starts_with("assured"));

        // All rookies -> price fallback.
        let s2 = state();
        register(&s2, PROV_A);
        register(&s2, PROV_B);
        let job2 = open_job(&s2, "assured");
        quote(&s2, PROV_A, job2, 800, 2_000);
        quote(&s2, PROV_B, job2, 700, 2_100);
        as_actor(REQUESTER, 0, 12_000);
        market!(&s2).award_job(job2).unwrap();
        let j2 = market!(&s2).get_job(job2).unwrap();
        assert_eq!(j2.winner, Some(ActorId::from(PROV_B)));
        assert!(j2.award_reason.unwrap().contains("no history"));
    }

    #[test]
    fn award_with_no_valid_quotes_refunds_and_expires() {
        let s = state();
        register(&s, PROV_A);
        let job = open_job(&s, "cheapest");
        quote(&s, PROV_A, job, 800, 2_000);
        // A withdraws after quoting; its quote is invalid at award time.
        as_actor(PROV_A, 0, 3_000);
        market!(&s).withdraw_bond().map(CommandReply::to_tuple).unwrap();
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(job).unwrap();
        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.status, Status::Expired);
        assert_eq!(j.settled, Some(Outcome::Refunded));
        assert_eq!(j.winner, None);
    }

    // ------------------------------------------------- receipt + verdict

    #[test]
    fn receipt_only_winner_in_time() {
        let s = state();
        let job = awarded_job(&s); // awarded at t=12s, deadline 30s

        as_actor(PROV_B, 0, 20_000);
        assert!(settlement!(&s)
            .submit_receipt(job, H256::zero(), "m".into())
            .unwrap_err()
            .contains("only the winner"));

        as_actor(PROV_A, 0, 42_001); // 12s + 30s deadline = 42s
        assert!(settlement!(&s)
            .submit_receipt(job, H256::zero(), "m".into())
            .unwrap_err()
            .contains("deadline passed"));

        as_actor(PROV_A, 0, 41_000);
        settlement!(&s).submit_receipt(job, H256::zero(), "m".into()).unwrap();
        assert_eq!(market!(&s).get_job(job).unwrap().status, Status::Delivered);

        // second receipt: wrong status now
        as_actor(PROV_A, 0, 41_500);
        assert!(settlement!(&s).submit_receipt(job, H256::zero(), "m".into()).is_err());
    }

    #[test]
    fn verdict_pass_pays_quoted_price_and_frees_provider() {
        let s = state();
        let job = awarded_job(&s);
        deliver(&s, job);

        as_actor(PROV_A, 0, 21_000); // not the verifier
        assert!(settlement!(&s)
            .submit_verdict(job, true, H256::zero())
            .unwrap_err()
            .contains("verifier"));

        as_actor(VERIFIER, 0, 21_000);
        settlement!(&s).submit_verdict(job, true, H256::zero()).unwrap();

        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.status, Status::Paid);
        assert_eq!(j.settled, Some(Outcome::Paid));
        let p = settlement!(&s).get_provider(ActorId::from(PROV_A)).unwrap();
        assert_eq!((p.jobs_passed, p.active_job), (1, None));
        assert_eq!(p.bond_wei, BOND); // no slash on pass
        assert_eq!(settlement!(&s).get_retained_wei(), 0);
    }

    #[test]
    fn verdict_fail_refunds_slashes_and_retains() {
        let s = state();
        let job = awarded_job(&s);
        deliver(&s, job);

        as_actor(VERIFIER, 0, 21_000);
        settlement!(&s).submit_verdict(job, false, H256::zero()).unwrap();

        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.status, Status::Refunded);
        let p = settlement!(&s).get_provider(ActorId::from(PROV_A)).unwrap();
        assert_eq!(p.bond_wei, BOND - SLASH);
        assert_eq!((p.jobs_failed, p.active_job), (1, None));
        // 50% of the slash to the requester, the rest retained.
        assert_eq!(settlement!(&s).get_retained_wei(), SLASH / 2);
    }

    #[test]
    fn settle_is_exactly_once() {
        let s = state();
        let job = awarded_job(&s);
        deliver(&s, job);
        as_actor(VERIFIER, 0, 21_000);
        settlement!(&s).submit_verdict(job, true, H256::zero()).unwrap();

        // Second verdict and expiry must both bounce off the settled job.
        assert!(settlement!(&s).submit_verdict(job, false, H256::zero()).is_err());
        as_actor(REQUESTER, 0, 99_000);
        assert!(settlement!(&s).expire_job(job).is_err());
    }

    // ------------------------------------------------------------ expiry

    #[test]
    fn expire_only_past_deadline_and_never_after_delivery() {
        let s = state();
        let job = awarded_job(&s); // awarded t=12s, deadline 30s

        as_actor(REQUESTER, 0, 42_000); // exactly at deadline: not yet
        assert!(settlement!(&s).expire_job(job).unwrap_err().contains("not past"));

        as_actor(REQUESTER, 0, 42_001);
        settlement!(&s).expire_job(job).unwrap();
        let j = market!(&s).get_job(job).unwrap();
        assert_eq!(j.status, Status::Expired);
        assert_eq!(j.settled, Some(Outcome::Refunded));
        let p = settlement!(&s).get_provider(ActorId::from(PROV_A)).unwrap();
        assert_eq!((p.jobs_expired, p.bond_wei), (1, BOND - SLASH));

        // Delivered blocks expiry (fresh run).
        let s2 = state();
        let job2 = awarded_job(&s2);
        deliver(&s2, job2);
        as_actor(REQUESTER, 0, 99_000);
        assert!(settlement!(&s2).expire_job(job2).is_err());
    }

    #[test]
    fn open_job_cannot_be_expired_or_delivered() {
        let s = state();
        register(&s, PROV_A);
        let job = open_job(&s, "cheapest");
        as_actor(REQUESTER, 0, 99_000);
        assert!(settlement!(&s).expire_job(job).is_err());
        as_actor(PROV_A, 0, 2_000);
        assert!(settlement!(&s).submit_receipt(job, H256::zero(), "m".into()).is_err());
    }

    // ----------------------------------------------------- conservation

    /// Book-keeping identity over a mixed history: everything that came in
    /// is either recorded as outbound (settled numbers), still locked
    /// (bonds), or retained (slash remainder).
    #[test]
    fn value_conservation_over_pass_fail_expire() {
        let s = state();
        let mut inflow: u128 = 0;
        let mut outflow: u128 = 0;

        // Job 1: pass at price 800, escrow 1500. awarded_job registers
        // providers A and B (two bonds in).
        let j1 = awarded_job(&s);
        inflow += 2 * BOND;
        inflow += 1_500;
        deliver(&s, j1);
        as_actor(VERIFIER, 0, 21_000);
        settlement!(&s).submit_verdict(j1, true, H256::zero()).unwrap();
        outflow += 800 + 700; // price to A, change to requester

        // Job 2: B wins alone, then fails. open_job stamps its own clock
        // (created at t=1s), so the standard quote/award times apply.
        let j2 = open_job(&s, "cheapest");
        quote(&s, PROV_B, j2, 600, 2_000);
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(j2).unwrap();
        inflow += 1_500;
        as_actor(PROV_B, 0, 13_000);
        settlement!(&s).submit_receipt(j2, H256::zero(), "m".into()).unwrap();
        as_actor(VERIFIER, 0, 14_000);
        settlement!(&s).submit_verdict(j2, false, H256::zero()).unwrap();
        outflow += 1_500 + SLASH / 2; // refund + slash share

        // Job 3: A (still bonded at the floor, idle after its pass) wins,
        // then lets the deadline lapse -> expiry, refund, second slash.
        let j3 = open_job(&s, "cheapest");
        quote(&s, PROV_A, j3, 800, 2_000);
        as_actor(REQUESTER, 0, 12_000);
        market!(&s).award_job(j3).unwrap();
        inflow += 1_500;
        // awarded at t=12s, 30s deadline -> expirable after t=42s.
        as_actor(REQUESTER, 0, 42_001);
        settlement!(&s).expire_job(j3).unwrap();
        outflow += 1_500 + SLASH / 2; // refund + slash share

        let st = s.borrow();
        let locked_bonds: u128 = st.providers.values().map(|p| p.bond_wei).sum();
        assert_eq!(locked_bonds, 2 * BOND - 2 * SLASH); // A and B each slashed once
        assert_eq!(st.retained_wei, SLASH); // two retained halves
        assert_eq!(inflow, outflow + locked_bonds + st.retained_wei);
    }
}
