use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pay<'info> {
    pub client: Signer<'info>,
}

pub fn handle_pay(_ctx: Context<Pay>, _expected_total: u64) -> Result<()> {
    Ok(())
}
