/**
 * Binance Spot historical kline adapter.
 *
 * Public market-data only. No credentials, account endpoints, or order methods.
 * Designed as a standalone ES module; integration into the single-file web app
 * requires an explicit bundling/import decision.
 */
const DEFAULT_BASE_URLS = [
  "https://data-api.binance.vision",
  "https://api.binance.com"
];
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 1000;
const INTERVAL_MS = Object.freeze({
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000,
  "4h": 14_400_000, "6h": 21_600_000, "8h": 28_800_000,
  "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000,
  "1w": 604_800_000
});

export class BinanceDataError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BinanceDataError";
    this.details = details;
  }
}

export function validateKlineRows(rows, { interval, startTime, endTime, asOf = Date.now() } = {}) {
  if (!Array.isArray(rows)) throw new BinanceDataError("Kline response must be an array.");
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) throw new BinanceDataError("Unsupported Binance kline interval.", { interval });
  if (!Number.isFinite(asOf)) throw new BinanceDataError("asOf must be a finite timestamp.");
  const errors = [];
  const candles = [];
  let previousOpen = -Infinity;

  rows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length < 8) {
      errors.push({ code: "ROW_SHAPE", index });
      return;
    }
    const [openTime, open, high, low, close, volume, closeTime, quoteVolume] = row.slice(0, 8).map(Number);
    if (![openTime, open, high, low, close, volume, closeTime, quoteVolume].every(Number.isFinite)) {
      errors.push({ code: "NON_FINITE", index }); return;
    }
    if (openTime < 0 || closeTime < openTime || open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
        high < Math.max(open, close, low) || low > Math.min(open, close, high) ||
        volume < 0 || quoteVolume < 0) {
      errors.push({ code: "INVALID_OHLCV", index }); return;
    }
    if (openTime <= previousOpen) {
      errors.push({ code: openTime === previousOpen ? "DUPLICATE_OPEN_TIME" : "OUT_OF_ORDER", index });
      return;
    }
    previousOpen = openTime;
    if (startTime != null && openTime < startTime) errors.push({ code: "BEFORE_START", index });
    if (endTime != null && openTime > endTime) errors.push({ code: "AFTER_END", index });
    if (closeTime < asOf) candles.push({
      openTime, open, high, low, close, volume, closeTime, quoteVolume, closed: true
    });
  });

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].openTime - candles[i - 1].openTime !== intervalMs) {
      errors.push({ code: "CANDLE_GAP", index: i, expectedMs: intervalMs,
        actualMs: candles[i].openTime - candles[i - 1].openTime });
    }
  }
  return { status: errors.length ? "FAIL" : "PASS", candles, errors, intervalMs };
}

function cacheKey(symbol, interval, startTime, endTime) {
  return [symbol.toUpperCase(), interval, startTime ?? "", endTime ?? ""].join(":");
}

export function createMemoryKlineCache() {
  const entries = new Map();
  return {
    get(key) { return entries.get(key) ?? null; },
    set(key, value) { entries.set(key, value); },
    clear() { entries.clear(); },
    get size() { return entries.size; }
  };
}

async function fetchPage({ symbol, interval, startTime, endTime, limit, fetchImpl, baseUrls, timeoutMs }) {
  let lastError;
  for (const baseUrl of baseUrls) {
    const url = new URL("/api/v3/klines", baseUrl);
    url.search = new URLSearchParams({
      symbol: symbol.toUpperCase(), interval, limit: String(limit),
      ...(startTime == null ? {} : { startTime: String(startTime) }),
      ...(endTime == null ? {} : { endTime: String(endTime) })
    }).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "GET", signal: controller.signal,
        headers: { Accept: "application/json" } });
      if (!response.ok) throw new BinanceDataError("Binance kline request failed.", {
        status: response.status, retryAfter: response.headers?.get?.("Retry-After"), endpoint: baseUrl
      });
      const data = await response.json();
      if (!Array.isArray(data)) throw new BinanceDataError("Unexpected Binance kline payload.");
      return data;
    } catch (error) {
      lastError = error;
      if (error?.details?.status === 418 || error?.details?.status === 429) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new BinanceDataError("All Binance public data endpoints failed.");
}

/**
 * Fetch all closed klines in [startTime, endTime] (open-time bounds).
 * Pagination advances by the last openTime + interval, never by array length.
 */
export async function fetchHistoricalKlines({
  symbol, interval, startTime, endTime, asOf = Date.now(),
  limit = DEFAULT_LIMIT, fetchImpl = globalThis.fetch,
  baseUrls = DEFAULT_BASE_URLS, timeoutMs = 12_000, cache = null,
  maxPages = 10_000
} = {}) {
  if (!/^[A-Z0-9]{2,30}$/.test(String(symbol ?? "").toUpperCase())) {
    throw new BinanceDataError("Invalid Binance Spot symbol.");
  }
  if (!INTERVAL_MS[interval]) throw new BinanceDataError("Unsupported interval.", { interval });
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime < startTime) {
    throw new BinanceDataError("A valid startTime and endTime are required.");
  }
  if (!Number.isFinite(asOf) || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT ||
      !Number.isInteger(maxPages) || maxPages < 1) throw new BinanceDataError("Invalid pagination options.");
  if (typeof fetchImpl !== "function") throw new BinanceDataError("Fetch implementation is unavailable.");

  const key = cacheKey(symbol, interval, startTime, endTime);
  const cached = cache?.get?.(key);
  if (cached?.status === "PASS" && cached.asOf === asOf) return { ...cached, cacheHit: true };

  const all = [];
  let cursor = startTime;
  let pages = 0;
  while (cursor <= endTime && pages < maxPages) {
    const rows = await fetchPage({ symbol, interval, startTime: cursor, endTime,
      limit, fetchImpl, baseUrls, timeoutMs });
    pages++;
    if (rows.length === 0) break;
    all.push(...rows);
    const lastOpen = Number(rows[rows.length - 1]?.[0]);
    if (!Number.isFinite(lastOpen) || lastOpen < cursor) {
      throw new BinanceDataError("Binance pagination did not advance.");
    }
    const next = lastOpen + INTERVAL_MS[interval];
    if (next <= cursor) throw new BinanceDataError("Binance pagination cursor stalled.");
    cursor = next;
    if (rows.length < limit) break;
  }
  if (pages >= maxPages && cursor <= endTime) {
    throw new BinanceDataError("Maximum pagination page count reached.", { maxPages });
  }

  const unique = new Map();
  for (const row of all) {
    const openTime = Number(row?.[0]);
    if (Number.isFinite(openTime)) {
      if (unique.has(openTime)) throw new BinanceDataError("Duplicate candle returned across pagination pages.", { openTime });
      unique.set(openTime, row);
    }
  }
  const rows = [...unique.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const validation = validateKlineRows(rows, { interval, startTime, endTime, asOf });
  const result = { ...validation, symbol: symbol.toUpperCase(), interval, pages,
    requested: { startTime, endTime }, asOf, cacheHit: false };
  if (result.status === "PASS") cache?.set?.(key, result);
  return result;
}

export const BINANCE_SPOT_INTERVALS = Object.freeze(Object.keys(INTERVAL_MS));
