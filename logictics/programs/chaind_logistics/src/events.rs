use anchor_lang::prelude::*;

#[event]
pub struct AgreementCreated {
    pub agreement: Pubkey,
    pub provider: Pubkey,
    pub client: Pubkey,
    pub courier: Pubkey,
}

#[event]
pub struct AgreementAccepted {
    pub agreement: Pubkey,
}

#[event]
pub struct OrderCreated {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub order_id: u64,
}

#[event]
pub struct PriceSet {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub fulfillment_price: u64,
    pub shipment_price: u64,
}

#[event]
pub struct OrderProcessed {
    pub agreement: Pubkey,
    pub order: Pubkey,
}

#[event]
pub struct OrderPaid {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub total: u64,
}

#[event]
pub struct InvoiceSent {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub invoice_hash: [u8; 32],
}

#[event]
pub struct OrderClosed {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub to_provider: u64,
    pub to_courier: u64,
}

#[event]
pub struct OrderCancelled {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct OrderRefunded {
    pub agreement: Pubkey,
    pub order: Pubkey,
    pub amount: u64,
}
