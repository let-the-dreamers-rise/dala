use anchor_lang::prelude::*;

#[event]
pub struct VaultOpened {
    pub vault: Pubkey,
    pub worker: Pubkey,
    pub payout_start: i64,
    pub period_secs: i64,
    pub periods: u16,
}

/// Every top-up is public: who paid, into whose vault, what kind, how much.
#[event]
pub struct Contributed {
    pub vault: Pubkey,
    pub from: Pubkey,
    pub kind: u8,
    pub amount: u64,
    pub ts: i64,
}

#[event]
pub struct Saved {
    pub vault: Pubkey,
    pub amount: u64,
    pub matched: u64,
    pub pool: Option<Pubkey>,
    pub ts: i64,
}

#[event]
pub struct Claimed {
    pub vault: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub periods_unlocked: u16,
    pub ts: i64,
}
