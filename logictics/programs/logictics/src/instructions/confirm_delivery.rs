use anchor_lang::prelude::*;

use crate::{
    events::OrderClosed,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct ConfirmDelivery<'info> {
    #[account(mut)]
    pub courier: Signer<'info>,
    #[account(mut)]
    pub provider: SystemAccount<'info>,
    #[account(has_one = courier, has_one = provider)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_confirm_delivery(ctx: Context<ConfirmDelivery>) -> Result<()> {
    let order = &mut ctx.accounts.order;

    // ENFORCES: delivery can only be confirmed once the order is invoiced
    order.apply(Action::ConfirmDelivery)?;

    let fulfillment = order.fulfillment_price;
    let shipment = order.shipment_price;

    emit!(OrderClosed {
        agreement: ctx.accounts.agreement.key(),
        order: order.key(),
        to_provider: fulfillment,
        to_courier: shipment,
    });

    // ENFORCES: escrow pays the 3PL's fulfillment fee and the courier's
    // shipment fee atomically; a program-owned PDA can't use a system
    // transfer, so lamports move with Anchor's checked account-info helpers.
    let order_info = order.to_account_info();
    order_info.sub_lamports(fulfillment)?;
    ctx.accounts.provider.add_lamports(fulfillment)?;
    order_info.sub_lamports(shipment)?;
    ctx.accounts.courier.add_lamports(shipment)?;

    Ok(())
}
