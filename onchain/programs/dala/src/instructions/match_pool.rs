use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    constants::*,
    error::DalaError,
    state::{MatchPool, MatchRecord, Vault},
};

#[derive(Accounts)]
pub struct CreateMatchPool<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = sponsor,
        space = 8 + MatchPool::INIT_SPACE,
        seeds = [POOL_SEED, sponsor.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, MatchPool>,
    #[account(
        init,
        payer = sponsor,
        seeds = [POOL_TOKENS_SEED, pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub pool_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create(ctx: Context<CreateMatchPool>, match_bps: u16, cap_per_worker: u64) -> Result<()> {
    require!(match_bps > 0 && match_bps <= MAX_MATCH_BPS, DalaError::InvalidMatchRate);
    require!(cap_per_worker > 0, DalaError::InvalidCap);
    ctx.accounts.pool.set_inner(MatchPool {
        sponsor: ctx.accounts.sponsor.key(),
        mint: ctx.accounts.mint.key(),
        match_bps,
        cap_per_worker,
        total_matched: 0,
        workers: 0,
        bump: ctx.bumps.pool,
        tokens_bump: ctx.bumps.pool_tokens,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    pub funder: Signer<'info>,
    #[account(mut, token::mint = mint, token::authority = funder)]
    pub from: Account<'info, TokenAccount>,
    #[account(address = pool.mint @ DalaError::MintMismatch)]
    pub mint: Account<'info, Mint>,
    #[account(seeds = [POOL_SEED, pool.sponsor.as_ref(), pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, MatchPool>,
    #[account(mut, seeds = [POOL_TOKENS_SEED, pool.key().as_ref()], bump = pool.tokens_bump)]
    pub pool_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_fund(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    require!(amount > 0, DalaError::ZeroAmount);
    token::transfer_checked(
        CpiContext::new(
            token::ID,
            TransferChecked {
                from: ctx.accounts.from.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.pool_tokens.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}

#[derive(Accounts)]
pub struct JoinPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub worker: Signer<'info>,
    #[account(
        seeds = [VAULT_SEED, worker.key().as_ref(), vault.mint.as_ref()],
        bump = vault.bump,
        has_one = worker,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [POOL_SEED, pool.sponsor.as_ref(), pool.mint.as_ref()],
        bump = pool.bump,
        constraint = pool.mint == vault.mint @ DalaError::MintMismatch,
    )]
    pub pool: Account<'info, MatchPool>,
    #[account(
        init,
        payer = payer,
        space = 8 + MatchRecord::INIT_SPACE,
        seeds = [MATCH_SEED, pool.key().as_ref(), vault.key().as_ref()],
        bump
    )]
    pub record: Account<'info, MatchRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handle_join(ctx: Context<JoinPool>) -> Result<()> {
    ctx.accounts.record.set_inner(MatchRecord {
        pool: ctx.accounts.pool.key(),
        vault: ctx.accounts.vault.key(),
        matched: 0,
        bump: ctx.bumps.record,
    });
    let pool = &mut ctx.accounts.pool;
    pool.workers = pool.workers.checked_add(1).ok_or(DalaError::Overflow)?;
    Ok(())
}
