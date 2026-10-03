use anchor_lang::prelude::*;

use crate::{
    constants::AGREEMENT_SEED, error::ErrorCode, events::AgreementAccepted, state::Agreement,
};

#[derive(Accounts)]
pub struct AcceptAgreement<'info> {
    pub client: Signer<'info>,
    #[account(
        mut,
        seeds = [AGREEMENT_SEED, agreement.provider.as_ref(), agreement.client.as_ref()],
        bump = agreement.bump,
        has_one = client,
    )]
    pub agreement: Account<'info, Agreement>,
}

pub fn handle_accept_agreement(ctx: Context<AcceptAgreement>) -> Result<()> {
    let agreement = &mut ctx.accounts.agreement;

    // ENFORCES: an agreement can only be accepted once
    require!(!agreement.accepted, ErrorCode::AlreadyAccepted);

    agreement.accepted = true;

    emit!(AgreementAccepted {
        agreement: agreement.key(),
    });

    Ok(())
}
