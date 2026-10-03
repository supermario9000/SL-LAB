use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ConfirmDelivery<'info> {
    pub client: Signer<'info>,
}

pub fn handle_confirm_delivery(_ctx: Context<ConfirmDelivery>) -> Result<()> {
    Ok(())
}
