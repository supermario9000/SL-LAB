use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    pub client: Signer<'info>,
}

pub fn handle_refund_expired(_ctx: Context<RefundExpired>) -> Result<()> {
    Ok(())
}
