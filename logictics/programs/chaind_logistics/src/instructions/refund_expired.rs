use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    events::OrderRefunded,
    math,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(has_one = client)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let agreement = &ctx.accounts.agreement;

    let now = Clock::get()?.unix_timestamp;
    // ENFORCES: the client can only reclaim escrow once the delivery deadline has passed
    require!(
        math::is_expired(now, order.paid_at, agreement.delivery_timeout)?,
        ErrorCode::NotExpired
    );

    order.apply(Action::RefundExpired)?;

    let total = math::total(order.fulfillment_price, order.shipment_price)?;

    emit!(OrderRefunded {
        agreement: agreement.key(),
        order: order.key(),
        amount: total,
    });

    let order_info = order.to_account_info();
    order_info.sub_lamports(total)?;
    ctx.accounts.client.to_account_info().add_lamports(total)?;

    Ok(())
}
