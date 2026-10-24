//! Pure functions for the payout schedule and matching, unit-tested without a VM.

use crate::constants::BPS_DENOMINATOR;

/// Number of payout periods unlocked at `now`. The first payment unlocks at `payout_start`.
pub fn periods_unlocked(now: i64, payout_start: i64, period_secs: i64, periods: u16) -> u16 {
    if now < payout_start || period_secs <= 0 {
        return 0;
    }
    let elapsed = ((now - payout_start) / period_secs).saturating_add(1);
    elapsed.min(periods as i64) as u16
}

/// Total amount unlocked so far: `total_in * unlocked / periods`, rounded down,
/// and exactly `total_in` once every period has unlocked.
pub fn unlocked_amount(total_in: u64, unlocked: u16, periods: u16) -> u64 {
    if periods == 0 || unlocked == 0 {
        return 0;
    }
    if unlocked >= periods {
        return total_in;
    }
    ((total_in as u128) * (unlocked as u128) / (periods as u128)) as u64
}

/// Match owed for a worker deposit, limited by the rate, her remaining cap and the pool balance.
pub fn match_for(amount: u64, match_bps: u16, cap: u64, already: u64, pool_balance: u64) -> u64 {
    let by_rate = ((amount as u128) * (match_bps as u128) / (BPS_DENOMINATOR as u128)) as u64;
    let remaining_cap = cap.saturating_sub(already);
    by_rate.min(remaining_cap).min(pool_balance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_unlocks_before_start() {
        assert_eq!(periods_unlocked(99, 100, 10, 12), 0);
    }

    #[test]
    fn first_period_unlocks_at_start() {
        assert_eq!(periods_unlocked(100, 100, 10, 12), 1);
        assert_eq!(periods_unlocked(109, 100, 10, 12), 1);
        assert_eq!(periods_unlocked(110, 100, 10, 12), 2);
    }

    #[test]
    fn unlock_caps_at_period_count() {
        assert_eq!(periods_unlocked(10_000, 100, 10, 12), 12);
    }

    #[test]
    fn unlocked_amount_is_proportional_and_exact_at_end() {
        assert_eq!(unlocked_amount(1_000, 1, 3), 333);
        assert_eq!(unlocked_amount(1_000, 2, 3), 666);
        assert_eq!(unlocked_amount(1_000, 3, 3), 1_000);
        assert_eq!(unlocked_amount(1_000, 0, 3), 0);
    }

    #[test]
    fn match_respects_rate_cap_and_balance() {
        // 1:1 match, cap 100, nothing matched yet, pool has plenty.
        assert_eq!(match_for(50, 10_000, 100, 0, 1_000), 50);
        // Cap nearly used.
        assert_eq!(match_for(50, 10_000, 100, 80, 1_000), 20);
        // Pool almost empty.
        assert_eq!(match_for(50, 10_000, 100, 0, 7), 7);
        // 50% match.
        assert_eq!(match_for(50, 5_000, 100, 0, 1_000), 25);
        // Cap fully used.
        assert_eq!(match_for(50, 10_000, 100, 100, 1_000), 0);
    }
}
