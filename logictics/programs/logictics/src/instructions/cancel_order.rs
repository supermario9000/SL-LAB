use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    events::OrderCancelled,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    pub signer: Signer<'info>,
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
    let signer_key = ctx.accounts.signer.key();
    let agreement = &ctx.accounts.agreement;

    // ENFORCES: only the 3PL or the client can cancel an order
    require!(
        signer_key == agreement.provider || signer_key == agreement.client,
        ErrorCode::NotAParty
    );

    let order = &mut ctx.accounts.order;
    // ENFORCES: an order can only be cancelled before payment
    order.apply(Action::Cancel)?;

    emit!(OrderCancelled {
        agreement: agreement.key(),
        order: order.key(),
        by: signer_key,
    });

    Ok(())
}
