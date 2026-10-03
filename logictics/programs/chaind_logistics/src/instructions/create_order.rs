use anchor_lang::prelude::*;

use crate::{
    constants::ORDER_SEED,
    error::ErrorCode,
    events::OrderCreated,
    state::{Agreement, Order, OrderStatus},
};

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct CreateOrder<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(mut, has_one = provider)]
    pub agreement: Account<'info, Agreement>,
    #[account(
        init,
        payer = provider,
        space = 8 + Order::INIT_SPACE,
        seeds = [ORDER_SEED, agreement.key().as_ref(), order_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub order: Account<'info, Order>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_order(ctx: Context<CreateOrder>, order_id: u64) -> Result<()> {
    let agreement = &mut ctx.accounts.agreement;

    // ENFORCES: terms must bind before any order can be created
    require!(agreement.accepted, ErrorCode::AgreementNotAccepted);
    // ENFORCES: order ids are sequential per agreement
    require!(order_id == agreement.next_order_id, ErrorCode::WrongOrderId);

    let order = &mut ctx.accounts.order;
    order.agreement = agreement.key();
    order.order_id = order_id;
    order.status = OrderStatus::Created;
    order.fulfillment_price = 0;
    order.shipment_price = 0;
    order.created_at = Clock::get()?.unix_timestamp;
    order.paid_at = 0;
    order.invoice_hash = [0u8; 32];
    order.bump = ctx.bumps.order;

    // ENFORCES: next_order_id never silently wraps
    agreement.next_order_id = agreement
        .next_order_id
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(OrderCreated {
        agreement: agreement.key(),
        order: order.key(),
        order_id,
    });

    Ok(())
}
