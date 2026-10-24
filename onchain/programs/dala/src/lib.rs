//! Dala: a retirement vault that belongs to the worker, not to an employer or a country.
//!
//! - `open_vault`: the worker fixes her payout start date and schedule. Nobody can change it.
//! - `contribute`: anyone (employer, family, NGO) tops up; every top-up is an on-chain event.
//! - `create_match_pool` / `fund_pool` / `join_pool`: a sponsor matches worker savings.
//! - `save` / `save_with_match`: the worker deposits; a pool match is paid only against it.
//! - `claim`: after the start date the worker withdraws only what has unlocked.
//!
//! There is no other way to move funds out of a vault.

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("J4NigtmbyxjPXkrLz77ZFpkQ3JXfVuBpzEyYWuGykoMY");

#[program]
pub mod dala {
    use super::*;

    pub fn open_vault(
        ctx: Context<OpenVault>,
        payout_start: i64,
        period_secs: i64,
        periods: u16,
    ) -> Result<()> {
        instructions::open_vault::handle_open_vault(ctx, payout_start, period_secs, periods)
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64, kind: u8) -> Result<()> {
        instructions::contribute::handle_contribute(ctx, amount, kind)
    }

    pub fn create_match_pool(
        ctx: Context<CreateMatchPool>,
        match_bps: u16,
        cap_per_worker: u64,
    ) -> Result<()> {
        instructions::match_pool::handle_create(ctx, match_bps, cap_per_worker)
    }

    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::match_pool::handle_fund(ctx, amount)
    }

    pub fn join_pool(ctx: Context<JoinPool>) -> Result<()> {
        instructions::match_pool::handle_join(ctx)
    }

    pub fn save(ctx: Context<Save>, amount: u64) -> Result<()> {
        instructions::save::handle_save(ctx, amount)
    }

    pub fn save_with_match(ctx: Context<SaveWithMatch>, amount: u64) -> Result<()> {
        instructions::save::handle_with_match(ctx, amount)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }
}
