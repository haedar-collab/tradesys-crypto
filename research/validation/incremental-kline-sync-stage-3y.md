# Stage 3Y — Incremental Kline Synchronization

## Scope

Synchronize closed Binance Spot candles for one symbol and interval. This is data-only: it does not read account state, submit orders, or create fills.

## Safety contract

- Timestamps are UTC milliseconds.
- Only a PASS batch from the fetch adapter can be persisted.
- The latest stored candle is fetched again as a one-candle overlap.
- The overlap is compared across OHLCV and close time. A mismatch returns REVIEW_REQUIRED; historical data is never silently rewritten.
- New candles must continue exactly one interval after the stored cursor. A gap returns REVIEW_REQUIRED and writes nothing.
- persistCandles is an injected storage boundary and MUST implement atomic, idempotent append semantics.
- An empty append is a NOOP.

## API

syncIncrementalKlines accepts symbol, interval, startTime, endTime, asOf, readLatest, persistCandles and fetchRange.

readLatest({symbol, interval}) returns the last stored closed candle or null.

persistCandles({symbol, interval, candles, mode}) atomically appends validated candles and returns an optional receipt.

fetchRange defaults to the Binance historical kline fetcher and must return a PASS batch.

## Test coverage

The test suite covers initial sync, overlap verification, append-only behavior, overlap mismatch, gap rejection, no-op behavior, and invalid interval rejection.

## Remaining integration work

The app IndexedDB cache currently stores whole range batches by exact cache key. It does not yet expose an atomic per-symbol/per-interval append operation or a readLatest query. A storage migration is required before this synchronizer is wired into the UI or scheduled refresh flow.
