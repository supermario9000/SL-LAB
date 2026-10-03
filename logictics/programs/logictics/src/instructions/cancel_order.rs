use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    pub signer: Signer<'info>,
}

pub fn handle_cancel_order(_ctx: Context<CancelOrder>) -> Result<()> {
    Ok(())
}
