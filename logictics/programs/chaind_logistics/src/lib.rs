pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;
pub mod state_machine;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("D4Zu8fGYGib6G18fu9XmMbDDrQB8hFQd7ge1MUax1Pna");

/// Escrow between a 3PL (provider), its client and a courier.
/// The client's payment is released to the 3PL and the courier on delivery.
#[program]
pub mod chaind_logistics {
    use super::*;

    // --- Agreement: binds a 3PL, a client and a courier ---

    /// 3PL proposes terms to a client and names the courier.
    pub fn init_agreement(
        ctx: Context<InitAgreement>,
        courier: Pubkey,
        delivery_timeout: i64,
    ) -> Result<()> {
        crate::instructions::init_agreement::handle_init_agreement(ctx, courier, delivery_timeout)
    }

    /// Client accepts; terms now bind.
    pub fn accept_agreement(ctx: Context<AcceptAgreement>) -> Result<()> {
        crate::instructions::accept_agreement::handle_accept_agreement(ctx)
    }

    // --- Order lifecycle: Created -> Processed -> Paid -> Invoiced -> Closed ---

    /// 3PL registers an order. Status `Created`.
    pub fn create_order(ctx: Context<CreateOrder>, order_id: u64) -> Result<()> {
        crate::instructions::create_order::handle_create_order(ctx, order_id)
    }

    /// 3PL sets the fulfillment fee. Only while `Created`.
    pub fn set_fulfillment_price(ctx: Context<SetFulfillmentPrice>, lamports: u64) -> Result<()> {
        crate::instructions::set_fulfillment_price::handle_set_fulfillment_price(ctx, lamports)
    }

    /// 3PL sets the shipment fee. Only while `Created`.
    pub fn set_shipment_price(ctx: Context<SetShipmentPrice>, lamports: u64) -> Result<()> {
        crate::instructions::set_shipment_price::handle_set_shipment_price(ctx, lamports)
    }

    /// 3PL marks the order picked and packed. Prices lock. Status `Processed`.
    pub fn mark_processed(ctx: Context<MarkProcessed>) -> Result<()> {
        crate::instructions::mark_processed::handle_mark_processed(ctx)
    }

    /// Client moves exactly `expected_total` into escrow. Status `Paid`.
    pub fn pay(ctx: Context<Pay>, expected_total: u64) -> Result<()> {
        crate::instructions::pay::handle_pay(ctx, expected_total)
    }

    /// 3PL records the invoice hash. Status `Invoiced`.
    pub fn send_invoice(ctx: Context<SendInvoice>, invoice_hash: [u8; 32]) -> Result<()> {
        crate::instructions::send_invoice::handle_send_invoice(ctx, invoice_hash)
    }

    /// Courier confirms delivery; escrow pays the fulfillment fee to the 3PL
    /// and the shipment fee to the courier. Status `Closed`.
    pub fn confirm_delivery(ctx: Context<ConfirmDelivery>) -> Result<()> {
        crate::instructions::confirm_delivery::handle_confirm_delivery(ctx)
    }

    // --- Exits: every order reaches a terminal state ---

    /// 3PL or client cancels before payment. Status `Cancelled`.
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        crate::instructions::cancel_order::handle_cancel_order(ctx)
    }

    /// Client reclaims the full escrow once `paid_at + timeout` has passed. Status `Refunded`.
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        crate::instructions::refund_expired::handle_refund_expired(ctx)
    }
}
