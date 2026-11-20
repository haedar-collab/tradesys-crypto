# Binance Spot Historical Data Adapter — Stage 3H

## Scope and repository boundary

This adapter belongs to `tradesys-crypto`, the application/data layer. It uses Binance public Spot market-data klines only. It contains no API keys, account endpoints, order methods, or trading permissions.

Implementation is a standalone ES module at `src/data/binance-historical-klines.mjs`. The current web app is a single-file `index.html`; this module is not yet imported by that page. Do not claim application integration until the app has an explicit module/bundling strategy and a browser-level test.

## Data behavior

- Requests `GET /api/v3/klines` from `data-api.binance.vision`, with `api.binance.com` as fallback.
- Paginates with Binance's maximum page size of 1000 and advances from last open time + interval.
- Supports standard fixed-duration Spot intervals from 1m through 1w.
- Requires explicit open-time `startTime` and `endTime`.
- Excludes any candle whose close time is not strictly earlier than `asOf`.
- Validates OHLCV, monotonic timestamps, duplicate timestamps and interval gaps.
- Exposes an injectable cache interface and an in-memory cache implementation.
- Rejects HTTP 418/429 without retry storms; caller should apply an explicit backoff policy.

## API

`fetchHistoricalKlines({ symbol, interval, startTime, endTime, asOf, fetchImpl, cache })`

`validateKlineRows(rows, { interval, startTime, endTime, asOf })`

`createMemoryKlineCache()`

## Known limitations / required follow-up

1. The module is not wired into `index.html` yet.
2. The in-memory cache is volatile. Persistent IndexedDB cache needs a separate implementation and quota/eviction policy.
3. Binance public endpoints may rate-limit or return incomplete historical ranges. A PASS result means structural integrity for returned rows, not proof that every expected market interval exists outside the returned range.
4. Current gap validation marks missing intervals as FAIL; symbol listing/delisting and known exchange outages need explicit gap-allowlist policy before broad historical universe scans.
5. Exchange maintenance, timezone boundaries, calendar intervals (1M) and historical symbol metadata are not implemented.
6. Tests use deterministic mocked HTTP responses. No live Binance download or real-market backtest has been performed by this change.
7. Before strategy evaluation, convert validated klines to the strategy repository's canonical candle schema and run its causal MTF replay. Fill simulation remains the strategy backtest engine's responsibility.
