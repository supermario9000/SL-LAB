use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitAgreement<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_init_agreement(_ctx: Context<InitAgreement>, _delivery_timeout: i64) -> Result<()> {
    Ok(())
}
