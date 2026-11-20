# Stage 4A — Multi-Timeframe Data Alignment

## Objective
Build a point-in-time aligned view across Binance Spot 1h, 4h, 1d and 1w candles without look-ahead leakage.

## Contract
- All timestamps are UTC milliseconds.
- A candle is eligible only when closed=true and closeTime < decisionTime.
- The latest eligible candle is selected independently for each timeframe.
- Candle ordering, OHLC relationships, and expected duration are validated.
- Stale or missing timeframes fail closed; no partial strategy context is emitted.
- The alignment result retains the exact decisionTime for auditability.

## Staleness
Default maximum age is 1.5 timeframe durations measured from candle close. This is a conservative operational freshness check, not a market signal.

## Important calendar note
The fixed-duration validation applies to Binance's UTC-aligned intervals represented by these intervals. Weekly boundary semantics must still be checked against actual Binance open times in live integration tests.

## Tests
Covers closed-candle selection, no-lookahead cutoff, missing data, failed batch, stale data, malformed duration, and strategy-context gating.

## Remaining work
- Add real IndexedDB browser integration tests.
- Validate Binance 1w candle boundaries against live public data.
- Connect aligned context to the strategy engine with an explicit as-of timestamp.
- Add cross-timeframe freshness and replay parity tests.
