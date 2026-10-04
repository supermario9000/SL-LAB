use anchor_lang::prelude::*;

use crate::{
    events::InvoiceSent,
    state::{Agreement, Order},
    state_machine::Action,
};

#[derive(Accounts)]
pub struct SendInvoice<'info> {
    pub provider: Signer<'info>,
    #[account(has_one = provider)]
    pub agreement: Account<'info, Agreement>,
    #[account(mut, has_one = agreement)]
    pub order: Account<'info, Order>,
}

pub fn handle_send_invoice(ctx: Context<SendInvoice>, invoice_hash: [u8; 32]) -> Result<()> {
    let order = &mut ctx.accounts.order;

    // ENFORCES: an invoice can only be sent once the order is paid
    order.apply(Action::SendInvoice)?;
    order.invoice_hash = invoice_hash;

    emit!(InvoiceSent {
        agreement: ctx.accounts.agreement.key(),
        order: order.key(),
        invoice_hash,
    });

    Ok(())
}
