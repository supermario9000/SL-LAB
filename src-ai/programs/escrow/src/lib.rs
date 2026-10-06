use anchor_lang::prelude::*;

declare_id!("2kE8h9erhYBRCJ6VAxsQZczDfHDvFZBtJg4NQczxEn6D");

// First checkpoint per planning/roadmap.md §4/§6: a trivial instruction that
// deploys and is callable, to kill toolchain risk before the real escrow
// state machine (Order, pay_order, confirm_delivery, ...) is built on top.
#[program]
pub mod escrow {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        ctx.accounts.config.admin = ctx.accounts.admin.key();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
}

impl Config {
    // admin: Pubkey
    pub const INIT_SPACE: usize = 32;
}
