use anchor_lang::prelude::*;

use crate::error::ErrorCode;

pub fn total(fulfillment_price: u64, shipment_price: u64) -> Result<u64> {
    fulfillment_price
        .checked_add(shipment_price)
        .ok_or_else(|| ErrorCode::MathOverflow.into())
}

pub fn deadline(paid_at: i64, timeout: i64) -> Result<i64> {
    paid_at
        .checked_add(timeout)
        .ok_or_else(|| ErrorCode::MathOverflow.into())
}

pub fn is_expired(now: i64, paid_at: i64, timeout: i64) -> Result<bool> {
    Ok(now >= deadline(paid_at, timeout)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn total_adds_normal_values() {
        assert_eq!(total(100, 50).unwrap(), 150);
        assert_eq!(total(0, 0).unwrap(), 0);
    }

    #[test]
    fn total_overflow_is_an_error() {
        assert!(total(u64::MAX, 1).is_err());
        assert!(total(u64::MAX, u64::MAX).is_err());
    }

    #[test]
    fn deadline_adds_normal_values() {
        assert_eq!(deadline(1_000, 60).unwrap(), 1_060);
    }

    #[test]
    fn deadline_overflow_is_an_error() {
        assert!(deadline(i64::MAX, 1).is_err());
    }

    #[test]
    fn is_expired_exact_boundary_counts_as_expired() {
        let paid_at = 1_000;
        let timeout = 60;
        assert!(!is_expired(1_059, paid_at, timeout).unwrap());
        assert!(is_expired(1_060, paid_at, timeout).unwrap());
        assert!(is_expired(1_061, paid_at, timeout).unwrap());
    }
}
