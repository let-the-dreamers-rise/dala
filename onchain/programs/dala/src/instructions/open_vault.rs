use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, error::DalaError, events::VaultOpened, state::Vault};

#[derive(Accounts)]
pub struct OpenVault<'info> {
    /// Pays rent. Can be an NGO or Dala's relayer, so the worker never needs gas.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub worker: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, worker.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_TOKENS_SEED, vault.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_vault(ctx: Context<OpenVault>, payout_start: i64, period_secs: i64, periods: u16) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(payout_start > now, DalaError::PayoutStartInPast);
    require!(period_secs > 0, DalaError::InvalidPeriod);
    require!(periods > 0 && periods <= MAX_PERIODS, DalaError::InvalidPeriodCount);

    let vault = &mut ctx.accounts.vault;
    vault.set_inner(Vault {
        worker: ctx.accounts.worker.key(),
        mint: ctx.accounts.mint.key(),
        payout_start,
        period_secs,
        periods,
        own_saved: 0,
        employer_in: 0,
        family_in: 0,
        other_in: 0,
        matched_in: 0,
        claimed: 0,
        opened_at: now,
        bump: ctx.bumps.vault,
        tokens_bump: ctx.bumps.vault_tokens,
    });

    emit!(VaultOpened {
        vault: vault.key(),
        worker: vault.worker,
        payout_start,
        period_secs,
        periods,
    });
    Ok(())
}
