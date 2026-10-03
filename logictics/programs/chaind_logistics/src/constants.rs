use anchor_lang::prelude::*;

#[constant]
pub const AGREEMENT_SEED: &[u8] = b"agreement";

#[constant]
pub const ORDER_SEED: &[u8] = b"order";

/// Funds can never be locked in escrow longer than this.
#[constant]
pub const MAX_DELIVERY_TIMEOUT: i64 = 90 * 24 * 60 * 60;

/// Lets tests use a short (e.g. 2 second) timeout.
#[constant]
pub const MIN_DELIVERY_TIMEOUT: i64 = 1;
