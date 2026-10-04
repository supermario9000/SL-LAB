use anchor_lang::prelude::*;

/// Binds a 3PL (`provider`), a `client` and a `courier` to a shared delivery
/// timeout. One agreement per (provider, client) pair.
#[account]
#[derive(InitSpace)]
pub struct Agreement {
    pub provider: Pubkey,
    pub client: Pubkey,
    pub courier: Pubkey,
    /// Seconds a `Paid` or `Invoiced` order may sit before the client can
    /// refund it.
    pub delivery_timeout: i64,
    pub accepted: bool,
    pub next_order_id: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum OrderStatus {
    Created,
    Processed,
    Paid,
    Invoiced,
    Closed,
    Cancelled,
    Refunded,
}

/// New fields are appended, never reordered — existing accounts must keep
/// deserializing after an upgrade.
#[account]
#[derive(InitSpace)]
pub struct Order {
    pub agreement: Pubkey,
    pub order_id: u64,
    pub status: OrderStatus,
    pub fulfillment_price: u64,
    pub shipment_price: u64,
    pub created_at: i64,
    /// 0 until paid.
    pub paid_at: i64,
    /// Zeroes until invoiced.
    pub invoice_hash: [u8; 32],
    pub bump: u8,
}
