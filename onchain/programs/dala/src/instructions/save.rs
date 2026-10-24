use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::*,
    error::DalaError,
    events::Saved,
    math::match_for,
    state::{MatchPool, MatchRecord, Vault},
};

#[derive(Accounts)]
pub struct Save<'info> {
    pub worker: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = worker)]
    pub from: Account<'info, TokenAccount>,
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
    pub token_program: Program<'info, Token>,
}

fn deposit<'info>(
    from: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    to: &Account<'info, TokenAccount>,
    worker: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new(
            token::ID,
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: worker.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )
}

pub fn handle_save(ctx: Context<Save>, amount: u64) -> Result<()> {
    require!(amount > 0, DalaError::ZeroAmount);
    let a = &ctx.accounts;
    deposit(&a.from, &a.mint, &a.vault_tokens, &a.worker, amount)?;

    let vault = &mut ctx.accounts.vault;
    vault.own_saved = vault.own_saved.checked_add(amount).ok_or(DalaError::Overflow)?;
    emit!(Saved {
        vault: vault.key(),
        amount,
        matched: 0,
        pool: None,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SaveWithMatch<'info> {
    pub worker: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = worker)]
    pub from: Account<'info, TokenAccount>,
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
    #[account(
        mut,
        seeds = [POOL_SEED, pool.sponsor.as_ref(), pool.mint.as_ref()],
        bump = pool.bump,
        constraint = pool.mint == vault.mint @ DalaError::MintMismatch,
    )]
    pub pool: Account<'info, MatchPool>,
    #[account(mut, seeds = [POOL_TOKENS_SEED, pool.key().as_ref()], bump = pool.tokens_bump)]
    pub pool_tokens: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [MATCH_SEED, pool.key().as_ref(), vault.key().as_ref()],
        bump = record.bump,
    )]
    pub record: Account<'info, MatchRecord>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_with_match(ctx: Context<SaveWithMatch>, amount: u64) -> Result<()> {
    require!(amount > 0, DalaError::ZeroAmount);
    let a = &ctx.accounts;
    deposit(&a.from, &a.mint, &a.vault_tokens, &a.worker, amount)?;

    let matched = match_for(
        amount,
        a.pool.match_bps,
        a.pool.cap_per_worker,
        a.record.matched,
        a.pool_tokens.amount,
    );

    if matched > 0 {
        let sponsor = a.pool.sponsor;
        let mint_key = a.pool.mint;
        let bump = [a.pool.bump];
        let seeds: &[&[u8]] = &[POOL_SEED, sponsor.as_ref(), mint_key.as_ref(), &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                token::ID,
                TransferChecked {
                    from: a.pool_tokens.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to: a.vault_tokens.to_account_info(),
                    authority: a.pool.to_account_info(),
                },
                &[seeds],
            ),
            matched,
            a.mint.decimals,
        )?;
    }

    let pool_key = ctx.accounts.pool.key();
    let record = &mut ctx.accounts.record;
    record.matched = record.matched.checked_add(matched).ok_or(DalaError::Overflow)?;
    let pool = &mut ctx.accounts.pool;
    pool.total_matched = pool.total_matched.checked_add(matched).ok_or(DalaError::Overflow)?;
    let vault = &mut ctx.accounts.vault;
    vault.own_saved = vault.own_saved.checked_add(amount).ok_or(DalaError::Overflow)?;
    vault.matched_in = vault.matched_in.checked_add(matched).ok_or(DalaError::Overflow)?;

    emit!(Saved {
        vault: vault.key(),
        amount,
        matched,
        pool: Some(pool_key),
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
