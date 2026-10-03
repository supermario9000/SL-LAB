use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetShipmentPrice<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_set_shipment_price(_ctx: Context<SetShipmentPrice>, _lamports: u64) -> Result<()> {
    Ok(())
}
