import { fetchHistoricalKlines } from "./binance-historical-klines.mjs";

const INTERVAL_MS = Object.freeze({
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000,
  "4h": 14_400_000, "6h": 21_600_000, "8h": 28_800_000,
  "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000,
  "1w": 604_800_000
});
const PRICE_FIELDS = ["open", "high", "low", "close", "volume", "closeTime"];

function validateArgs({ symbol, interval, startTime, endTime, asOf }) {
  if (!/^[A-Z0-9]{2,30}$/.test(String(symbol ?? "").toUpperCase())) throw new TypeError("Invalid symbol");
  if (!INTERVAL_MS[interval]) throw new RangeError("Unsupported interval");
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) ||
      startTime < 0 || endTime < startTime) throw new RangeError("Invalid UTC millisecond range");
  if (!Number.isFinite(asOf)) throw new TypeError("asOf must be finite");
}

function sameCandle(a, b) {
  return PRICE_FIELDS.every(field => Number(a[field]) === Number(b[field]));
}

/**
 * readLatest returns the last persisted closed candle or null.
 * persistCandles MUST atomically and idempotently append candles.
 * The latest candle is fetched again as an overlap to detect revisions.
 * Mismatches stop synchronization; historical data is never silently overwritten.
 */
export async function syncIncrementalKlines({
  symbol, interval, startTime, endTime, asOf = Date.now(),
  readLatest, persistCandles, fetchRange = fetchHistoricalKlines, fetchOptions = {}
} = {}) {
  validateArgs({ symbol, interval, startTime, endTime, asOf });
  if (typeof readLatest !== "function" || typeof persistCandles !== "function" ||
      typeof fetchRange !== "function") {
    throw new TypeError("readLatest, persistCandles and fetchRange are required functions");
  }
  const normalizedSymbol = symbol.toUpperCase();
  const step = INTERVAL_MS[interval];
  const latest = await readLatest({ symbol: normalizedSymbol, interval });
  if (latest && (!Number.isSafeInteger(latest.openTime) ||
      !Number.isFinite(latest.closeTime) || latest.closeTime >= asOf)) {
    return { status: "REVIEW_REQUIRED", reason: "INVALID_LATEST_STORED_CANDLE",
      symbol: normalizedSymbol, interval, fetchedCount: 0, appendedCount: 0 };
  }
  const requestedStart = latest ? latest.openTime : startTime;
  if (latest && latest.openTime < startTime) {
    return { status: "REVIEW_REQUIRED", reason: "STORED_CURSOR_PRECEDES_CONFIGURED_START",
      symbol: normalizedSymbol, interval, fetchedCount: 0, appendedCount: 0 };
  }
  if (requestedStart > endTime) {
    return { status: "NOOP", reason: "STORAGE_AHEAD_OF_REQUEST",
      symbol: normalizedSymbol, interval, fetchedCount: 0, appendedCount: 0 };
  }
  const batch = await fetchRange({
    ...fetchOptions, symbol: normalizedSymbol, interval,
    startTime: requestedStart, endTime, asOf
  });
  if (!batch || batch.status !== "PASS" || !Array.isArray(batch.candles)) {
    return { status: "REVIEW_REQUIRED", reason: "FETCH_VALIDATION_FAILED",
      symbol: normalizedSymbol, interval, fetchedCount: batch?.candles?.length ?? 0,
      errors: batch?.errors ?? [] };
  }
  let append = batch.candles;
  if (latest) {
    const overlap = append.find(c => c.openTime === latest.openTime);
    if (!overlap || !sameCandle(overlap, latest)) {
      return { status: "REVIEW_REQUIRED", reason: "OVERLAP_MISMATCH",
        symbol: normalizedSymbol, interval, fetchedCount: append.length, appendedCount: 0 };
    }
    append = append.filter(c => c.openTime > latest.openTime);
  }
  let expected = latest ? latest.openTime + step : null;
  for (const candle of append) {
    if (expected !== null && candle.openTime !== expected) {
      return { status: "REVIEW_REQUIRED", reason: "INCREMENTAL_GAP",
        symbol: normalizedSymbol, interval, expectedOpenTime: expected,
        actualOpenTime: candle.openTime, fetchedCount: batch.candles.length, appendedCount: 0 };
    }
    expected = candle.openTime + step;
  }
  if (append.length === 0) {
    return { status: "NOOP", reason: "ALREADY_UP_TO_DATE",
      symbol: normalizedSymbol, interval, fetchedCount: batch.candles.length, appendedCount: 0,
      lastOpenTime: latest?.openTime ?? null };
  }
  const receipt = await persistCandles({
    symbol: normalizedSymbol, interval, candles: append,
    mode: latest ? "APPEND" : "INITIAL"
  });
  return { status: "SYNCED", symbol: normalizedSymbol, interval,
    fetchedCount: batch.candles.length, appendedCount: append.length,
    firstAppendedOpenTime: append[0].openTime,
    lastAppendedOpenTime: append[append.length - 1].openTime,
    receipt: receipt ?? null };
}

export const INCREMENTAL_SYNC_INTERVALS = Object.freeze(Object.keys(INTERVAL_MS));
