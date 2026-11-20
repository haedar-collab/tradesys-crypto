# Stage 3Z — Atomic IndexedDB Candle Store

## Scope
Adds a per-candle IndexedDB store separate from the existing batch cache. The composite primary key is (symbol, interval, openTime), preventing duplicate keys for a candle.

## Operations
- readLatest({symbol, interval}) returns the latest candle.
- readRange({symbol, interval, startTime, endTime}) returns sorted candles.
- appendCandles({symbol, interval, candles}) checks conflicts and writes new candles in one readwrite transaction.
- Identical existing candles are idempotent no-ops; differing content at an existing timestamp aborts the transaction.

## Safety
OHLCV shape and price relationships are validated. IndexedDB transactions provide atomicity for the batch. This module does not claim cloud backup, encryption, multi-device replication, or browser-independent persistence.

## Integration boundary
The incremental synchronizer can now be wired with readLatest and appendCandles through thin adapters. The existing batch cache remains unchanged to avoid destructive migration.

## Tests
Node unit tests cover append planning, idempotency, conflict rejection, OHLC validation, and chronological ordering. Browser-level IndexedDB transaction tests remain a separate integration test requirement.
