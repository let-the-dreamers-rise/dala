use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{constants::*, error::DalaError, events::Contributed, state::Vault};

#[derive(Accounts)]
pub struct Contribute<'info> {
    pub contributor: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = contributor)]
    pub from: Account<'info, TokenAccount>,
    #[account(address = vault.mint @ DalaError::MintMismatch)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [VAULT_SEED, vault.worker.as_ref(), vault.mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [VAULT_TOKENS_SEED, vault.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_contribute(ctx: Context<Contribute>, amount: u64, kind: u8) -> Result<()> {
    require!(amount > 0, DalaError::ZeroAmount);
    require!(kind <= KIND_OTHER, DalaError::InvalidKind);

    token::transfer_checked(
        CpiContext::new(
            token::ID,
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault_tokens.to_account_info(),
                authority: ctx.accounts.contributor.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let vault = &mut ctx.accounts.vault;
    let bucket = match kind {
        KIND_EMPLOYER => &mut vault.employer_in,
        KIND_FAMILY => &mut vault.family_in,
        _ => &mut vault.other_in,
    };
    *bucket = bucket.checked_add(amount).ok_or(DalaError::Overflow)?;

    emit!(Contributed {
        vault: vault.key(),
        from: ctx.accounts.contributor.key(),
        kind,
        amount,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
