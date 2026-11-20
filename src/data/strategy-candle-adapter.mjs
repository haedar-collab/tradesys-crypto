/**
 * Convert validated Binance adapter candles into strategy canonical candle rows.
 * Preserve millisecond timestamps; strategy replay must apply its own as-of filter.
 */
export function toStrategyCandles(batch) {
  if (!batch || batch.status !== "PASS" || !Array.isArray(batch.candles)) {
    throw new TypeError("A PASS-validated Binance batch is required");
  }
  let previous = -Infinity;
  return batch.candles.map((candle, index) => {
    const values = [candle.openTime, candle.closeTime, candle.open, candle.high,
      candle.low, candle.close, candle.volume];
    if (!values.every(Number.isFinite) || candle.openTime <= previous ||
        candle.closeTime < candle.openTime || candle.high < Math.max(candle.open, candle.close, candle.low) ||
        candle.low > Math.min(candle.open, candle.close, candle.high)) {
      throw new RangeError(`Invalid canonical candle at index ${index}`);
    }
    previous = candle.openTime;
    return Object.freeze({
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      source: "BINANCE_SPOT",
      closed: candle.closed === true
    });
  });
}

export function validateTimeframeBatchSet(batches, { asOf, required = ["1w", "1d", "4h", "1h"] } = {}) {
  if (!Number.isFinite(asOf)) throw new TypeError("asOf must be a finite timestamp");
  const missing = required.filter(interval => !batches?.[interval]);
  const invalid = [];
  for (const interval of required) {
    const batch = batches?.[interval];
    if (!batch) continue;
    if (batch.status !== "PASS" || !Array.isArray(batch.candles) ||
        batch.candles.some(c => c.closed !== true || c.closeTime >= asOf)) invalid.push(interval);
  }
  return { status: missing.length || invalid.length ? "FAIL" : "PASS", missing, invalid, asOf };
}
