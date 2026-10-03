use anchor_lang::prelude::*;

use crate::{error::ErrorCode, state::Order, state::OrderStatus};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Action {
    SetPrice,
    MarkProcessed,
    Pay,
    SendInvoice,
    ConfirmDelivery,
    Cancel,
    RefundExpired,
}

/// The single source of truth for which (status, action) pairs are legal.
/// Everything not listed here is an `InvalidTransition`.
pub fn next(from: OrderStatus, action: Action) -> Result<OrderStatus> {
    use Action::*;
    use OrderStatus::*;

    match (from, action) {
        (Created, SetPrice) => Ok(Created),
        (Created, MarkProcessed) => Ok(Processed),
        (Created, Cancel) => Ok(Cancelled),
        (Processed, Pay) => Ok(Paid),
        (Processed, Cancel) => Ok(Cancelled),
        (Paid, SendInvoice) => Ok(Invoiced),
        (Paid, RefundExpired) => Ok(Refunded),
        (Invoiced, ConfirmDelivery) => Ok(Closed),
        (Invoiced, RefundExpired) => Ok(Refunded),
        _ => Err(ErrorCode::InvalidTransition.into()),
    }
}

impl Order {
    /// The only place that writes `status`.
    pub fn apply(&mut self, action: Action) -> Result<()> {
        self.status = next(self.status, action)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use OrderStatus::*;

    const ALL_STATUSES: [OrderStatus; 7] = [
        Created, Processed, Paid, Invoiced, Closed, Cancelled, Refunded,
    ];
    const ALL_ACTIONS: [Action; 7] = [
        Action::SetPrice,
        Action::MarkProcessed,
        Action::Pay,
        Action::SendInvoice,
        Action::ConfirmDelivery,
        Action::Cancel,
        Action::RefundExpired,
    ];

    fn allowed_pairs() -> Vec<(OrderStatus, Action, OrderStatus)> {
        vec![
            (Created, Action::SetPrice, Created),
            (Created, Action::MarkProcessed, Processed),
            (Created, Action::Cancel, Cancelled),
            (Processed, Action::Pay, Paid),
            (Processed, Action::Cancel, Cancelled),
            (Paid, Action::SendInvoice, Invoiced),
            (Paid, Action::RefundExpired, Refunded),
            (Invoiced, Action::ConfirmDelivery, Closed),
            (Invoiced, Action::RefundExpired, Refunded),
        ]
    }

    #[test]
    fn every_allowed_transition_succeeds() {
        for (from, action, to) in allowed_pairs() {
            assert_eq!(
                next(from, action).unwrap(),
                to,
                "{:?} --{:?}--> expected {:?}",
                from,
                action,
                to
            );
        }
    }

    #[test]
    fn every_other_pair_is_rejected() {
        let allowed = allowed_pairs();
        for &from in ALL_STATUSES.iter() {
            for &action in ALL_ACTIONS.iter() {
                if allowed.iter().any(|(f, a, _)| *f == from && *a == action) {
                    continue;
                }
                assert!(
                    next(from, action).is_err(),
                    "{:?} --{:?}--> should be rejected",
                    from,
                    action
                );
            }
        }
    }

    #[test]
    fn terminal_states_reject_everything() {
        for &terminal in [Closed, Cancelled, Refunded].iter() {
            for &action in ALL_ACTIONS.iter() {
                assert!(
                    next(terminal, action).is_err(),
                    "terminal state {:?} must reject {:?}",
                    terminal,
                    action
                );
            }
        }
    }

    #[test]
    fn apply_writes_status_via_next() {
        let mut order = Order {
            agreement: Pubkey::default(),
            order_id: 0,
            status: Created,
            fulfillment_price: 0,
            shipment_price: 0,
            created_at: 0,
            paid_at: 0,
            invoice_hash: [0u8; 32],
            bump: 0,
        };

        order.apply(Action::MarkProcessed).unwrap();
        assert_eq!(order.status, Processed);

        assert!(order.apply(Action::MarkProcessed).is_err());
        assert_eq!(order.status, Processed, "status must not change on error");
    }
}
