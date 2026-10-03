use anchor_lang::prelude::*;

use crate::{
    error::ErrorCode,
    events::OrderPaid,
    math,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct Pay<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(has_one = client)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
    pub system_program: Program<'info, System>,
}

pub fn handle_pay(ctx: Context<Pay>, expected_total: u64) -> Result<()> {
    let order = &mut ctx.accounts.order;

    let total = math::total(order.fulfillment_price, order.shipment_price)?;
    // ENFORCES: the client pays exactly the order's total, no more, no less
    require!(expected_total == total, ErrorCode::TotalMismatch);

    order.apply(Action::Pay)?;
    order.paid_at = Clock::get()?.unix_timestamp;

    emit!(OrderPaid {
        agreement: ctx.accounts.agreement.key(),
        order: order.key(),
        total,
    });

    let cpi_accounts = anchor_lang::system_program::Transfer {
        from: ctx.accounts.client.to_account_info(),
        to: order.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.system_program.key(), cpi_accounts);
    anchor_lang::system_program::transfer(cpi_ctx, total)?;

    Ok(())
}
