use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetFulfillmentPrice<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_set_fulfillment_price(
    _ctx: Context<SetFulfillmentPrice>,
    _lamports: u64,
) -> Result<()> {
    Ok(())
}
