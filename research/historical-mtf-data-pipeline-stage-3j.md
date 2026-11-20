# Historical MTF Data Pipeline — Stage 3J

- Orchestrates Binance Spot public kline fetches for 1w, 1d, 4h and 1h.
- Uses explicit per-timeframe open-time ranges and one fixed asOf timestamp.
- Uses asynchronous IndexedDB cache and canonical strategy candle conversion.
- Fails closed for missing/invalid timeframe data or candles not closed strictly before asOf.
- IndexedDB cache supports maximum entry count and age-based pruning.

Limitations:
- Standalone ES modules; not wired into the single-file index.html UI.
- Per-timeframe ranges are caller-supplied.
- Any candle gap currently fails validation; listing periods/delistings/outages need explicit policy.
- Tests use mocked responses. No live data download or strategy performance result is claimed.
- Cross-repository causal replay adapter and actual end-to-end backtest remain future work.
- No orders or trading execution.
