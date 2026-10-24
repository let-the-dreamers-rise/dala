use anchor_lang::prelude::*;

/// One worker's retirement vault for one stablecoin mint.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub worker: Pubkey,
    pub mint: Pubkey,
    pub payout_start: i64,
    pub period_secs: i64,
    pub periods: u16,
    /// Deposits by the worker herself.
    pub own_saved: u64,
    pub employer_in: u64,
    pub family_in: u64,
    pub other_in: u64,
    /// Paid in by match pools against her own deposits.
    pub matched_in: u64,
    pub claimed: u64,
    pub opened_at: i64,
    pub bump: u8,
    pub tokens_bump: u8,
}

impl Vault {
    pub fn total_in(&self) -> Option<u64> {
        self.own_saved
            .checked_add(self.employer_in)?
            .checked_add(self.family_in)?
            .checked_add(self.other_in)?
            .checked_add(self.matched_in)
    }
}

/// A sponsor's matching pool (employer, NGO or foundation).
#[account]
#[derive(InitSpace)]
pub struct MatchPool {
    pub sponsor: Pubkey,
    pub mint: Pubkey,
    pub match_bps: u16,
    pub cap_per_worker: u64,
    pub total_matched: u64,
    pub workers: u32,
    pub bump: u8,
    pub tokens_bump: u8,
}

/// How much a pool has matched for one vault, to enforce the per-worker cap.
#[account]
#[derive(InitSpace)]
pub struct MatchRecord {
    pub pool: Pubkey,
    pub vault: Pubkey,
    pub matched: u64,
    pub bump: u8,
}
