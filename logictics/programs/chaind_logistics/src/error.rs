use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Delivery timeout must be between 1 second and 90 days")]
    InvalidTimeout,
    #[msg("3PL, client and courier must be three different wallets")]
    PartiesNotDistinct,
    #[msg("This agreement has already been accepted")]
    AlreadyAccepted,
    #[msg("The client has not accepted this agreement yet")]
    AgreementNotAccepted,
    #[msg("Order id must be the next id for this agreement")]
    WrongOrderId,
    #[msg("This action is not allowed in the order's current status")]
    InvalidTransition,
    #[msg("Set the fulfillment and shipment prices first")]
    PriceNotSet,
    #[msg("The amount you approved does not match the order total")]
    TotalMismatch,
    #[msg("Only the 3PL or the client can do this")]
    NotAParty,
    #[msg("The delivery deadline has not passed yet")]
    NotExpired,
    #[msg("Amount is too large")]
    MathOverflow,
}
