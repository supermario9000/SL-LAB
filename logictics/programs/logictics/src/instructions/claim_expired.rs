use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimExpired<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_claim_expired(_ctx: Context<ClaimExpired>) -> Result<()> {
    Ok(())
}
