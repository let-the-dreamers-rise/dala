//! End-to-end tests for the Dala program on LiteSVM.
//! Token mints and wallets are written directly as SPL Token accounts; the vault and pool
//! token accounts are created by the program itself.

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::token::ID as TOKEN_PROGRAM_ID,
    dala::{constants::*, state::*},
    litesvm::LiteSVM,
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const DECIMALS: u8 = 6;
const START_OFFSET: i64 = 1_000;
const PERIOD: i64 = 100;
const PERIODS: u16 = 4;

struct Env {
    svm: LiteSVM,
    payer: Keypair,
    worker: Keypair,
    employer: Keypair,
    sponsor: Keypair,
    mint: Pubkey,
    worker_wallet: Pubkey,
    employer_wallet: Pubkey,
    sponsor_wallet: Pubkey,
    family_wallet: Pubkey,
    vault: Pubkey,
    vault_tokens: Pubkey,
    pool: Pubkey,
    pool_tokens: Pubkey,
    record: Pubkey,
    payout_start: i64,
}

fn mint_data(authority: &Pubkey) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    d[0..4].copy_from_slice(&1u32.to_le_bytes());
    d[4..36].copy_from_slice(authority.as_ref());
    d[36..44].copy_from_slice(&1_000_000_000_000u64.to_le_bytes());
    d[44] = DECIMALS;
    d[45] = 1;
    d
}

fn token_account_data(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = 1; // AccountState::Initialized
    d
}

fn put_token_owned(svm: &mut LiteSVM, key: Pubkey, data: Vec<u8>) {
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        key,
        Account { lamports, data, owner: TOKEN_PROGRAM_ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
}

fn new_wallet(svm: &mut LiteSVM, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Pubkey {
    let key = Pubkey::new_unique();
    put_token_owned(svm, key, token_account_data(mint, owner, amount));
    key
}

fn token_balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    let acc = svm.get_account(key).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

fn warp_to(svm: &mut LiteSVM, ts: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = ts;
    clock.slot += 10;
    svm.set_sysvar(&clock);
    svm.expire_blockhash();
}

fn send(svm: &mut LiteSVM, ix: Instruction, fee_payer: &Keypair, signers: &[&Keypair]) -> Result<(), String> {
    // Fresh blockhash per tx, so two identical deposits are not deduplicated.
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&fee_payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn fetch<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).unwrap();
    let mut data: &[u8] = &acc.data;
    T::try_deserialize(&mut data).unwrap()
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
    Instruction::new_with_bytes(dala::id(), &data.data(), accounts.to_account_metas(None))
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/dala.so"));
    svm.add_program(dala::id(), bytes).unwrap();
    warp_to(&mut svm, 1_800_000_000);

    let payer = Keypair::new();
    let worker = Keypair::new();
    let employer = Keypair::new();
    let sponsor = Keypair::new();
    for k in [&payer, &worker, &employer, &sponsor] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }

    let mint = Pubkey::new_unique();
    put_token_owned(&mut svm, mint, mint_data(&payer.pubkey()));
    let worker_wallet = new_wallet(&mut svm, &mint, &worker.pubkey(), 1_000);
    let employer_wallet = new_wallet(&mut svm, &mint, &employer.pubkey(), 1_000);
    let sponsor_wallet = new_wallet(&mut svm, &mint, &sponsor.pubkey(), 1_000);
    let family_wallet = new_wallet(&mut svm, &mint, &Pubkey::new_unique(), 0);

    let pid = dala::id();
    let vault = Pubkey::find_program_address(
        &[VAULT_SEED, worker.pubkey().as_ref(), mint.as_ref()],
        &pid,
    )
    .0;
    let vault_tokens = Pubkey::find_program_address(&[VAULT_TOKENS_SEED, vault.as_ref()], &pid).0;
    let pool = Pubkey::find_program_address(
        &[POOL_SEED, sponsor.pubkey().as_ref(), mint.as_ref()],
        &pid,
    )
    .0;
    let pool_tokens = Pubkey::find_program_address(&[POOL_TOKENS_SEED, pool.as_ref()], &pid).0;
    let record = Pubkey::find_program_address(&[MATCH_SEED, pool.as_ref(), vault.as_ref()], &pid).0;
    let payout_start = now(&svm) + START_OFFSET;

    Env {
        svm, payer, worker, employer, sponsor, mint, worker_wallet, employer_wallet,
        sponsor_wallet, family_wallet, vault, vault_tokens, pool, pool_tokens, record, payout_start,
    }
}

fn open_vault(e: &mut Env) -> Result<(), String> {
    let i = ix(
        dala::instruction::OpenVault { payout_start: e.payout_start, period_secs: PERIOD, periods: PERIODS },
        dala::accounts::OpenVault {
            payer: e.payer.pubkey(),
            worker: e.worker.pubkey(),
            mint: e.mint,
            vault: e.vault,
            vault_tokens: e.vault_tokens,
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        },
    );
    let (payer, worker) = (e.payer.insecure_clone(), e.worker.insecure_clone());
    send(&mut e.svm, i, &payer, &[&payer, &worker])
}

fn create_and_fund_pool(e: &mut Env, bps: u16, cap: u64, fund: u64) {
    let i = ix(
        dala::instruction::CreateMatchPool { match_bps: bps, cap_per_worker: cap },
        dala::accounts::CreateMatchPool {
            sponsor: e.sponsor.pubkey(),
            mint: e.mint,
            pool: e.pool,
            pool_tokens: e.pool_tokens,
            token_program: TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        },
    );
    let sponsor = e.sponsor.insecure_clone();
    send(&mut e.svm, i, &sponsor, &[&sponsor]).unwrap();
    let i = ix(
        dala::instruction::FundPool { amount: fund },
        dala::accounts::FundPool {
            funder: e.sponsor.pubkey(),
            from: e.sponsor_wallet,
            mint: e.mint,
            pool: e.pool,
            pool_tokens: e.pool_tokens,
            token_program: TOKEN_PROGRAM_ID,
        },
    );
    send(&mut e.svm, i, &sponsor, &[&sponsor]).unwrap();
}

fn join_pool(e: &mut Env) {
    let i = ix(
        dala::instruction::JoinPool {},
        dala::accounts::JoinPool {
            payer: e.payer.pubkey(),
            worker: e.worker.pubkey(),
            vault: e.vault,
            pool: e.pool,
            record: e.record,
            system_program: system_program::ID,
        },
    );
    let (payer, worker) = (e.payer.insecure_clone(), e.worker.insecure_clone());
    send(&mut e.svm, i, &payer, &[&payer, &worker]).unwrap();
}

fn contribute(e: &mut Env, amount: u64, kind: u8) -> Result<(), String> {
    let i = ix(
        dala::instruction::Contribute { amount, kind },
        dala::accounts::Contribute {
            contributor: e.employer.pubkey(),
            from: e.employer_wallet,
            mint: e.mint,
            vault: e.vault,
            vault_tokens: e.vault_tokens,
            token_program: TOKEN_PROGRAM_ID,
        },
    );
    let employer = e.employer.insecure_clone();
    send(&mut e.svm, i, &employer, &[&employer])
}

fn save_with_match(e: &mut Env, signer: &Keypair, from: Pubkey, amount: u64) -> Result<(), String> {
    let i = ix(
        dala::instruction::SaveWithMatch { amount },
        dala::accounts::SaveWithMatch {
            worker: signer.pubkey(),
            from,
            mint: e.mint,
            vault: e.vault,
            vault_tokens: e.vault_tokens,
            pool: e.pool,
            pool_tokens: e.pool_tokens,
            record: e.record,
            token_program: TOKEN_PROGRAM_ID,
        },
    );
    send(&mut e.svm, i, signer, &[signer])
}

fn save(e: &mut Env, amount: u64) -> Result<(), String> {
    let i = ix(
        dala::instruction::Save { amount },
        dala::accounts::Save {
            worker: e.worker.pubkey(),
            from: e.worker_wallet,
            mint: e.mint,
            vault: e.vault,
            vault_tokens: e.vault_tokens,
            token_program: TOKEN_PROGRAM_ID,
        },
    );
    let worker = e.worker.insecure_clone();
    send(&mut e.svm, i, &worker, &[&worker])
}

fn claim(e: &mut Env, signer: &Keypair, to: Pubkey) -> Result<(), String> {
    let i = ix(
        dala::instruction::Claim {},
        dala::accounts::Claim {
            worker: signer.pubkey(),
            mint: e.mint,
            vault: e.vault,
            vault_tokens: e.vault_tokens,
            to,
            token_program: TOKEN_PROGRAM_ID,
        },
    );
    send(&mut e.svm, i, signer, &[signer])
}

#[test]
fn full_lifecycle_save_match_lock_and_monthly_payout() {
    let mut e = setup();
    open_vault(&mut e).unwrap();
    create_and_fund_pool(&mut e, 10_000, 150, 1_000);
    join_pool(&mut e);

    contribute(&mut e, 200, KIND_EMPLOYER).unwrap();
    let worker = e.worker.insecure_clone();
    let ww = e.worker_wallet;
    save_with_match(&mut e, &worker, ww, 100).unwrap(); // matched 100
    save_with_match(&mut e, &worker, ww, 100).unwrap(); // matched 50, cap reached
    save(&mut e, 40).unwrap();

    let v: Vault = fetch(&e.svm, &e.vault);
    assert_eq!(v.employer_in, 200);
    assert_eq!(v.own_saved, 240);
    assert_eq!(v.matched_in, 150);
    assert_eq!(v.total_in(), Some(590));
    assert_eq!(token_balance(&e.svm, &e.vault_tokens), 590);
    let r: MatchRecord = fetch(&e.svm, &e.record);
    assert_eq!(r.matched, 150);
    let p: MatchPool = fetch(&e.svm, &e.pool);
    assert_eq!(p.total_matched, 150);
    assert_eq!(p.workers, 1);
    assert_eq!(token_balance(&e.svm, &e.pool_tokens), 850);

    // Locked before the payout start, even for the worker herself.
    let fw = e.family_wallet;
    let err = claim(&mut e, &worker, fw).unwrap_err();
    assert!(err.contains("PayoutNotStarted"), "{err}");

    // First monthly payment, sent to her family's wallet at home.
    warp_to(&mut e.svm, e.payout_start);
    claim(&mut e, &worker, fw).unwrap();
    assert_eq!(token_balance(&e.svm, &fw), 147); // floor(590 / 4)

    // Nothing more until the next period.
    let err = claim(&mut e, &worker, fw).unwrap_err();
    assert!(err.contains("NothingToClaim"), "{err}");

    warp_to(&mut e.svm, e.payout_start + PERIOD);
    claim(&mut e, &worker, fw).unwrap();
    assert_eq!(token_balance(&e.svm, &fw), 295); // floor(590 * 2 / 4)

    // After the last period everything has been paid out.
    warp_to(&mut e.svm, e.payout_start + PERIOD * 10);
    claim(&mut e, &worker, fw).unwrap();
    assert_eq!(token_balance(&e.svm, &fw), 590);
    assert_eq!(token_balance(&e.svm, &e.vault_tokens), 0);
}

#[test]
fn nobody_else_can_claim_her_pension() {
    let mut e = setup();
    open_vault(&mut e).unwrap();
    contribute(&mut e, 300, KIND_EMPLOYER).unwrap();
    warp_to(&mut e.svm, e.payout_start + PERIOD * 10);

    // The employer who paid in cannot take it back.
    let employer = e.employer.insecure_clone();
    let ew = e.employer_wallet;
    assert!(claim(&mut e, &employer, ew).is_err());
    assert_eq!(token_balance(&e.svm, &e.vault_tokens), 300);
}

#[test]
fn only_the_worker_can_trigger_a_match() {
    let mut e = setup();
    open_vault(&mut e).unwrap();
    create_and_fund_pool(&mut e, 10_000, 150, 1_000);
    join_pool(&mut e);

    // The employer tries to "save" into her vault to farm the sponsor's match.
    let employer = e.employer.insecure_clone();
    let ew = e.employer_wallet;
    assert!(save_with_match(&mut e, &employer, ew, 100).is_err());
    assert_eq!(token_balance(&e.svm, &e.pool_tokens), 1_000);
}

#[test]
fn match_stops_when_pool_runs_dry() {
    let mut e = setup();
    open_vault(&mut e).unwrap();
    create_and_fund_pool(&mut e, 10_000, 500, 30);
    join_pool(&mut e);
    let worker = e.worker.insecure_clone();
    let ww = e.worker_wallet;
    save_with_match(&mut e, &worker, ww, 100).unwrap();
    let v: Vault = fetch(&e.svm, &e.vault);
    assert_eq!(v.matched_in, 30);
    assert_eq!(v.own_saved, 100);
    assert_eq!(token_balance(&e.svm, &e.pool_tokens), 0);
}

#[test]
fn rejects_bad_schedules_and_inputs() {
    let mut e = setup();
    e.payout_start = now(&e.svm) - 1;
    let err = open_vault(&mut e).unwrap_err();
    assert!(err.contains("PayoutStartInPast"), "{err}");

    let mut e = setup();
    open_vault(&mut e).unwrap();
    let err = contribute(&mut e, 0, KIND_FAMILY).unwrap_err();
    assert!(err.contains("ZeroAmount"), "{err}");
    let err = contribute(&mut e, 10, 9).unwrap_err();
    assert!(err.contains("InvalidKind"), "{err}");
}
