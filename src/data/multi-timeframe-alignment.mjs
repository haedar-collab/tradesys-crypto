const INTERVAL_MS = Object.freeze({
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000
});
const DEFAULT_REQUIRED = Object.freeze(["1w", "1d", "4h", "1h"]);

function validCandle(candle) {
  return candle && Number.isSafeInteger(candle.openTime) &&
    Number.isFinite(candle.closeTime) && candle.closeTime > candle.openTime &&
    ["open", "high", "low", "close", "volume"].every(k => Number.isFinite(Number(candle[k]))) &&
    candle.low <= Math.min(candle.open, candle.close) &&
    candle.high >= Math.max(candle.open, candle.close) && candle.low <= candle.high &&
    Number(candle.volume) >= 0;
}

/**
 * Select the latest fully closed candle for each timeframe at a single UTC decision time.
 * No candle whose closeTime is equal to or later than decisionTime can be selected.
 */
export function alignMultiTimeframeCandles(batches, {
  decisionTime, required = DEFAULT_REQUIRED, maxAgeMultiples = 1.5
} = {}) {
  if (!Number.isFinite(decisionTime)) throw new TypeError("decisionTime must be a finite UTC millisecond timestamp");
  if (!Array.isArray(required) || required.length === 0 ||
      required.some(interval => !INTERVAL_MS[interval])) throw new RangeError("Unsupported or empty required timeframe set");
  if (!Number.isFinite(maxAgeMultiples) || maxAgeMultiples < 1) throw new RangeError("maxAgeMultiples must be >= 1");

  const missing = [];
  const invalid = [];
  const stale = [];
  const selected = {};
  const errors = [];

  for (const interval of required) {
    const batch = batches?.[interval];
    if (!batch) { missing.push(interval); continue; }
    if (batch.status !== "PASS" || !Array.isArray(batch.candles)) {
      invalid.push(interval);
      errors.push({ interval, code: "BATCH_NOT_PASS" });
      continue;
    }

    let previousOpen = -Infinity;
    for (const candle of batch.candles) {
      if (!validCandle(candle) || candle.openTime <= previousOpen ||
          candle.closeTime - candle.openTime + 1 !== INTERVAL_MS[interval]) {
        invalid.push(interval);
        errors.push({ interval, code: "INVALID_OR_UNSORTED_CANDLE", openTime: candle?.openTime ?? null });
        break;
      }
      previousOpen = candle.openTime;
    }
    if (invalid.includes(interval)) continue;

    const eligible = batch.candles.filter(c => c.closed === true && c.closeTime < decisionTime);
    const latest = eligible.at(-1);
    if (!latest) {
      stale.push(interval);
      errors.push({ interval, code: "NO_CLOSED_CANDLE_AS_OF_DECISION" });
      continue;
    }
    const age = decisionTime - (latest.closeTime + 1);
    if (age > INTERVAL_MS[interval] * maxAgeMultiples) {
      stale.push(interval);
      errors.push({ interval, code: "STALE_TIMEFRAME", ageMs: age });
      continue;
    }
    selected[interval] = Object.freeze({ ...latest, interval, ageMs: age });
  }

  const status = missing.length || invalid.length || stale.length ? "FAIL" : "PASS";
  return Object.freeze({
    status, decisionTime, required: [...required], missing, invalid, stale,
    selected: status === "PASS" ? Object.freeze(selected) : Object.freeze({}),
    errors
  });
}

/**
 * Produce an immutable point-in-time strategy row. The decision timestamp is
 * retained so downstream strategy code can audit the exact information cutoff.
 */
export function toAlignedStrategyContext(alignment) {
  if (!alignment || alignment.status !== "PASS") {
    throw new TypeError("A PASS multi-timeframe alignment is required");
  }
  return Object.freeze({
    source: "BINANCE_SPOT",
    decisionTime: alignment.decisionTime,
    timeframes: alignment.selected
  });
}

export const ALIGNMENT_TIMEFRAMES = DEFAULT_REQUIRED;
