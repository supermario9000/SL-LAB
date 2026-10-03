use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateOrder<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_create_order(_ctx: Context<CreateOrder>, _order_id: u64) -> Result<()> {
    Ok(())
}
