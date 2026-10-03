use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct MarkProcessed<'info> {
    pub provider: Signer<'info>,
}

pub fn handle_mark_processed(_ctx: Context<MarkProcessed>) -> Result<()> {
    Ok(())
}
