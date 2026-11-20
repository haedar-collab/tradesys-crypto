import { syncIncrementalKlines } from "./incremental-kline-sync.mjs";

/**
 * Wire the incremental synchronizer to the per-candle IndexedDB store.
 * The store must implement readLatest and appendCandles.
 */
export async function syncIndexedDbKlines({
  store, symbol, interval, startTime, endTime, asOf, fetchRange, fetchOptions
} = {}) {
  if (!store || typeof store.readLatest !== "function" ||
      typeof store.appendCandles !== "function") {
    throw new TypeError("A compatible IndexedDB candle store is required");
  }
  return syncIncrementalKlines({
    symbol, interval, startTime, endTime, asOf, fetchRange, fetchOptions,
    readLatest: key => store.readLatest(key),
    persistCandles: ({ symbol: targetSymbol, interval: targetInterval, candles }) =>
      store.appendCandles({ symbol: targetSymbol, interval: targetInterval, candles })
  });
}
