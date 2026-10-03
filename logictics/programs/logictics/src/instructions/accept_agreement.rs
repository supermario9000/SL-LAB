use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AcceptAgreement<'info> {
    pub client: Signer<'info>,
}

pub fn handle_accept_agreement(_ctx: Context<AcceptAgreement>) -> Result<()> {
    Ok(())
}
