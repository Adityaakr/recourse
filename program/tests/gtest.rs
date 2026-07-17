// Integration tests against the real wasm: value actually moves here.
// Amounts are in gtest UNITS multiples (ED = 1e12) so transfers clear the
// existential deposit.

use ::recourse_client::{RecourseClient as _, RecourseClientCtors as _, market::*, settlement::*};
use sails_rs::{client::*, gtest::*, prelude::*};
use sails_rs::gtest::ethexe::System;
use core::result::Result;

const UNITS: u128 = 1_000_000_000_000;
const BOND: u128 = 20 * UNITS;
const SLASH: u128 = 10 * UNITS;
const BPS: u32 = 5_000;

const REQUESTER: u64 = 100;
const BOT_A: u64 = 201;
const BOT_B: u64 = 202;
const VERIFIER: u64 = 900;
const KEEPER: u64 = 950;

const ESCROW: u128 = 15 * UNITS;
const MAX_PRICE: u128 = 10 * UNITS;
const PRICE_A: u128 = 8 * UNITS;
const PRICE_B: u128 = 9 * UNITS;

fn actor(id: u64) -> ActorId {
    ActorId::from(id)
}

type ProgramActor = sails_rs::client::Actor<::recourse_client::RecourseClientProgram, GtestEnv>;

async fn deploy(salt: &[u8]) -> (GtestEnv, ProgramActor) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    for id in [REQUESTER, BOT_A, BOT_B, VERIFIER, KEEPER] {
        system.mint_to(id, 1_000 * UNITS);
    }
    let code_id = system.submit_code(::recourse::WASM_BINARY);
    let env = GtestEnv::new(system, actor(REQUESTER));
    let program = env
        .deploy::<::recourse_client::RecourseClientProgram>(code_id, salt.to_vec())
        .create(actor(VERIFIER), BOND, SLASH, BPS)
        .await
        .unwrap();
    (env, program)
}

/// Register both bots and fund a job (30s quote window, 30s deadline),
/// collect both quotes, then advance past the window and award.
/// Winner is BOT_A at PRICE_A under `cheapest`.
async fn awarded_job(
    env: &GtestEnv,
    program: &ProgramActor,
) -> u64 {
    let mut market = program.market();
    market
        .register_provider()
        .with_actor_id(actor(BOT_A))
        .with_value(BOND)
        .await
        .unwrap()
        .unwrap();
    market
        .register_provider()
        .with_actor_id(actor(BOT_B))
        .with_value(BOND)
        .await
        .unwrap()
        .unwrap();

    let job_id = market
        .create_job(
            MAX_PRICE,
            30,
            "unit-tests-v1".into(),
            [7u8; 32],
            "cheapest".into(),
            30,
        )
        .with_actor_id(actor(REQUESTER))
        .with_value(ESCROW)
        .await
        .unwrap()
        .unwrap();

    market
        .submit_quote(job_id, PRICE_A, 400)
        .with_actor_id(actor(BOT_A))
        .await
        .unwrap()
        .unwrap();
    market
        .submit_quote(job_id, PRICE_B, 900)
        .with_actor_id(actor(BOT_B))
        .await
        .unwrap()
        .unwrap();

    // Push program time past the 30s quote window (blocks are 3s).
    for _ in 0..12 {
        env.run_next_block();
    }

    market
        .award_job(job_id)
        .with_actor_id(actor(KEEPER))
        .await
        .unwrap()
        .unwrap();
    job_id
}

#[tokio::test]
async fn err_reply_returns_value_and_keeps_none() {
    let (env, program) = deploy(b"err-value").await;
    let mut market = program.market();

    let result: Result<(), String> = market
        .register_provider()
        .with_actor_id(actor(BOT_A))
        .with_value(BOND / 2) // below the configured bond
        .await
        .unwrap();
    assert!(result.unwrap_err().contains("bond too small"));

    // The failed call must not leave any value with the program, and the
    // provider must not exist.
    assert_eq!(env.system().balance_of(program.id()), 0);
    let p = program.settlement().get_provider(actor(BOT_A)).await.unwrap();
    assert!(p.is_none());
}

#[tokio::test]
async fn pass_flow_pays_winner_and_returns_change() {
    let (env, program) = deploy(b"pass-flow").await;
    let job_id = awarded_job(&env, &program).await;
    let mut settlement = program.settlement();

    settlement
        .submit_receipt(job_id, H256::from([9u8; 32]), "mock".into())
        .with_actor_id(actor(BOT_A))
        .await
        .unwrap()
        .unwrap();

    settlement
        .submit_verdict(job_id, true, H256::from([1u8; 32]))
        .with_actor_id(actor(VERIFIER))
        .await
        .unwrap()
        .unwrap();

    let job = program.market().get_job(job_id).await.unwrap().unwrap();
    assert_eq!(job.status, Status::Paid);
    assert_eq!(job.settled, Some(Outcome::Paid));

    // gtest-ethexe mirrors the real chain: program-to-user value leaves
    // the program and becomes claimable on L1 (mirror.claimValue) rather
    // than crediting user balances here. The program-side balance is the
    // observable conservation check: all escrow left, both bonds remain.
    // The user-side claim leg is exercised on hoodi at M2.
    assert_eq!(env.system().balance_of(program.id()), 2 * BOND);

    let p = program
        .settlement()
        .get_provider(actor(BOT_A))
        .await
        .unwrap()
        .unwrap();
    assert_eq!((p.jobs_passed, p.active_job), (1, None));
}

#[tokio::test]
async fn fail_flow_refunds_slashes_and_retains() {
    let (env, program) = deploy(b"fail-flow").await;
    let job_id = awarded_job(&env, &program).await;
    let mut settlement = program.settlement();

    settlement
        .submit_receipt(job_id, H256::from([9u8; 32]), "mock".into())
        .with_actor_id(actor(BOT_A))
        .await
        .unwrap()
        .unwrap();

    settlement
        .submit_verdict(job_id, false, H256::from([2u8; 32]))
        .with_actor_id(actor(VERIFIER))
        .await
        .unwrap()
        .unwrap();

    let job = program.market().get_job(job_id).await.unwrap().unwrap();
    assert_eq!(job.status, Status::Refunded);

    // Program keeps both bonds minus the slash, plus the retained half;
    // the escrow and the requester's slash share left as claimable value.
    assert_eq!(
        env.system().balance_of(program.id()),
        2 * BOND - SLASH + (SLASH - SLASH / 2)
    );
    assert_eq!(settlement.get_retained_wei().await.unwrap(), SLASH - SLASH / 2);

    let p = settlement.get_provider(actor(BOT_A)).await.unwrap().unwrap();
    assert_eq!(p.bond_wei, BOND - SLASH);
    assert_eq!((p.jobs_failed, p.active_job), (1, None));
}

#[tokio::test]
async fn expiry_refunds_and_counts_against_provider() {
    let (env, program) = deploy(b"expire-flow").await;
    let job_id = awarded_job(&env, &program).await;
    let mut settlement = program.settlement();

    // Too early: the deadline (30s) has not passed.
    let early: Result<(), String> = settlement
        .expire_job(job_id)
        .with_actor_id(actor(KEEPER))
        .await
        .unwrap();
    assert!(early.unwrap_err().contains("not past"));

    for _ in 0..12 {
        env.run_next_block();
    }

    settlement
        .expire_job(job_id)
        .with_actor_id(actor(KEEPER))
        .await
        .unwrap()
        .unwrap();

    let job = program.market().get_job(job_id).await.unwrap().unwrap();
    assert_eq!(job.status, Status::Expired);
    assert_eq!(job.settled, Some(Outcome::Refunded));
    // Escrow + slash share left the program as claimable value.
    assert_eq!(
        env.system().balance_of(program.id()),
        2 * BOND - SLASH + (SLASH - SLASH / 2)
    );

    let p = settlement.get_provider(actor(BOT_A)).await.unwrap().unwrap();
    assert_eq!((p.jobs_expired, p.bond_wei), (1, BOND - SLASH));
}

#[tokio::test]
async fn settlement_is_exactly_once() {
    let (env, program) = deploy(b"double-settle").await;
    let job_id = awarded_job(&env, &program).await;
    let mut settlement = program.settlement();

    settlement
        .submit_receipt(job_id, H256::from([9u8; 32]), "mock".into())
        .with_actor_id(actor(BOT_A))
        .await
        .unwrap()
        .unwrap();
    settlement
        .submit_verdict(job_id, true, H256::from([1u8; 32]))
        .with_actor_id(actor(VERIFIER))
        .await
        .unwrap()
        .unwrap();

    // A second verdict and a late expiry must both fail loudly.
    let again: Result<(), String> = settlement
        .submit_verdict(job_id, false, H256::from([2u8; 32]))
        .with_actor_id(actor(VERIFIER))
        .await
        .unwrap();
    assert!(again.is_err());

    for _ in 0..12 {
        env.run_next_block();
    }
    let expire: Result<(), String> = settlement
        .expire_job(job_id)
        .with_actor_id(actor(KEEPER))
        .await
        .unwrap();
    assert!(expire.is_err());

    // Paid exactly once: program balance is exactly the two bonds.
    assert_eq!(env.system().balance_of(program.id()), 2 * BOND);
}
