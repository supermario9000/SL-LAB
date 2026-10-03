use anchor_lang::prelude::*;

use crate::{
    constants::{AGREEMENT_SEED, MAX_DELIVERY_TIMEOUT, MIN_DELIVERY_TIMEOUT},
    error::ErrorCode,
    events::AgreementCreated,
    state::Agreement,
};

#[derive(Accounts)]
pub struct InitAgreement<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    /// CHECK: just a key — the client signs for themselves later, in `accept_agreement`.
    pub client: UncheckedAccount<'info>,
    #[account(
        init,
        payer = provider,
        space = 8 + Agreement::INIT_SPACE,
        seeds = [AGREEMENT_SEED, provider.key().as_ref(), client.key().as_ref()],
        bump,
    )]
    pub agreement: Account<'info, Agreement>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_agreement(
    ctx: Context<InitAgreement>,
    courier: Pubkey,
    delivery_timeout: i64,
) -> Result<()> {
    // ENFORCES: funds can never be locked in escrow for longer than 90 days
    require!(
        (MIN_DELIVERY_TIMEOUT..=MAX_DELIVERY_TIMEOUT).contains(&delivery_timeout),
        ErrorCode::InvalidTimeout
    );

    let provider = ctx.accounts.provider.key();
    let client = ctx.accounts.client.key();

    // ENFORCES: 3PL, client and courier must be three different wallets
    require!(
        provider != client && client != courier && courier != provider,
        ErrorCode::PartiesNotDistinct
    );

    let agreement = &mut ctx.accounts.agreement;
    agreement.provider = provider;
    agreement.client = client;
    agreement.courier = courier;
    agreement.delivery_timeout = delivery_timeout;
    agreement.accepted = false;
    agreement.next_order_id = 0;
    agreement.bump = ctx.bumps.agreement;

    emit!(AgreementCreated {
        agreement: agreement.key(),
        provider,
        client,
        courier,
    });

    Ok(())
}
