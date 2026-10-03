use anchor_lang::prelude::*;

use crate::{
    events::PriceSet,
    math,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct SetShipmentPrice<'info> {
    pub provider: Signer<'info>,
    #[account(has_one = provider)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_set_shipment_price(ctx: Context<SetShipmentPrice>, lamports: u64) -> Result<()> {
    let order = &mut ctx.accounts.order;

    // ENFORCES: prices can only change while the order is still `Created`
    order.apply(Action::SetPrice)?;

    order.shipment_price = lamports;
    // ENFORCES: the total must fit in u64 before the order can ever be paid
    math::total(order.fulfillment_price, order.shipment_price)?;

    emit!(PriceSet {
        agreement: ctx.accounts.agreement.key(),
        order: order.key(),
        fulfillment_price: order.fulfillment_price,
        shipment_price: order.shipment_price,
    });

    Ok(())
}
