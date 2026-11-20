# Strategy Data Contract v1 — Application Producer

The application produces a versioned, transport-safe JSON payload for the separate strategy repository.

- `schema_version`: 1.0.0
- Venue: BINANCE / SPOT
- Universe: one symbol, quote asset and exchange status
- Market: symbol-keyed Weekly, Daily, 4H and 1H arrays
- Candle timestamps: UTC epoch milliseconds; OHLCV numeric; closed flag boolean
- Context: historical-research mode, ordered evaluation timestamps and close policy
- Account: neutral placeholder values only; consumer must not interpret these as a funded account

This is a transport contract, not an order request. It contains no API credentials, order instructions or permission to execute trades. The producer rejects incomplete datasets and invalid evaluation timelines.
