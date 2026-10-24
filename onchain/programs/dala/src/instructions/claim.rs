use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::*,
    error::DalaError,
    events::Claimed,
    math::{periods_unlocked, unlocked_amount},
    state::Vault,
};

#[derive(Accounts)]
pub struct Claim<'info> {
    pub worker: Signer<'info>,
    #[account(address = vault.mint @ DalaError::MintMismatch)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [VAULT_SEED, worker.key().as_ref(), vault.mint.as_ref()],
        bump = vault.bump,
        has_one = worker,
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [VAULT_TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Account<'info, TokenAccount>,
    /// Any account of the same mint: her own wallet or a family member's at home.
    #[account(mut, token::mint = mint)]
    pub to: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let v = &ctx.accounts.vault;
    require!(now >= v.payout_start, DalaError::PayoutNotStarted);

    let unlocked_periods = periods_unlocked(now, v.payout_start, v.period_secs, v.periods);
    let total_in = v.total_in().ok_or(DalaError::Overflow)?;
    let unlocked = unlocked_amount(total_in, unlocked_periods, v.periods);
    let amount = unlocked.saturating_sub(v.claimed).min(ctx.accounts.vault_tokens.amount);
    require!(amount > 0, DalaError::NothingToClaim);

    let worker = v.worker;
    let mint_key = v.mint;
    let bump = [v.bump];
    let seeds: &[&[u8]] = &[VAULT_SEED, worker.as_ref(), mint_key.as_ref(), &bump];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token::ID,
            TransferChecked {
                from: ctx.accounts.vault_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.claimed = vault.claimed.checked_add(amount).ok_or(DalaError::Overflow)?;
    emit!(Claimed {
        vault: vault.key(),
        to: ctx.accounts.to.key(),
        amount,
        periods_unlocked: unlocked_periods,
        ts: now,
    });
    Ok(())
}
