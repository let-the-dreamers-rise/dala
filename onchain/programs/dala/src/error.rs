use anchor_lang::prelude::*;

#[error_code]
pub enum DalaError {
    #[msg("Payout start must be in the future")]
    PayoutStartInPast,
    #[msg("Payout period length must be positive")]
    InvalidPeriod,
    #[msg("Number of payout periods must be between 1 and 600")]
    InvalidPeriodCount,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Unknown contribution kind")]
    InvalidKind,
    #[msg("Match rate must be between 1 and 30000 basis points")]
    InvalidMatchRate,
    #[msg("Cap per worker must be greater than zero")]
    InvalidCap,
    #[msg("Retirement payouts have not started yet")]
    PayoutNotStarted,
    #[msg("Nothing has unlocked since the last claim")]
    NothingToClaim,
    #[msg("Token mint does not match the vault or pool")]
    MintMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
}
