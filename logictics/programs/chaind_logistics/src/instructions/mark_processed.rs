use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    events::OrderProcessed,
    math,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct MarkProcessed<'info> {
    pub provider: Signer<'info>,
    #[account(has_one = provider)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_mark_processed(ctx: Context<MarkProcessed>) -> Result<()> {
    let order = &mut ctx.accounts.order;

    // ENFORCES: both prices must be set before work can be marked processed
    let total = math::total(order.fulfillment_price, order.shipment_price)?;
    require!(total > 0, ErrorCode::PriceNotSet);

    order.apply(Action::MarkProcessed)?;

    emit!(OrderProcessed {
        agreement: ctx.accounts.agreement.key(),
        order: order.key(),
    });

    Ok(())
}
