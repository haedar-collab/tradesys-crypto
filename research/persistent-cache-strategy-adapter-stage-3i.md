# Persistent Cache and Strategy Candle Adapter — Stage 3I

## Implemented

- IndexedDB cache stores only batches marked PASS by the Binance adapter.
- Cache records are keyed by symbol, interval and requested time range.
- Async get/put/delete/clear/close operations are provided.
- Strategy adapter preserves millisecond open/close timestamps and OHLCV.
- Multi-timeframe batch gate requires 1w, 1d, 4h and 1h data to be closed strictly before the evaluation timestamp.

## Browser integration status

These are standalone ES modules. The current app remains a single-file `index.html`; no module loader/bundler has been added and these modules are not yet wired into the UI. Browser-level IndexedDB tests are still required.

## Limitations

- No eviction/quota policy yet; production cache needs retention and size management.
- No cross-tab version migration beyond schema version 1.
- Adapter uses normalized candle objects from the preceding Binance fetcher.
- Real historical data download, symbol coverage and end-to-end strategy replay are not claimed by this stage.
