use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const VAULT_TOKENS_SEED: &[u8] = b"vault_tokens";
#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const POOL_TOKENS_SEED: &[u8] = b"pool_tokens";
#[constant]
pub const MATCH_SEED: &[u8] = b"match";

/// 100% in basis points. A pool may match at most 1:1 (10_000) up to 3:1.
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_MATCH_BPS: u16 = 30_000;

/// Payout schedule bounds: at most 50 years of monthly payments.
pub const MAX_PERIODS: u16 = 600;

pub const KIND_EMPLOYER: u8 = 0;
pub const KIND_FAMILY: u8 = 1;
pub const KIND_OTHER: u8 = 2;
