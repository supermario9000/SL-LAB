use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SendInvoice<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_send_invoice(_ctx: Context<SendInvoice>, _invoice_hash: [u8; 32]) -> Result<()> {
    Ok(())
}
