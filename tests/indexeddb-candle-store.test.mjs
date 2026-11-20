import test from "node:test";
import assert from "node:assert/strict";
import { planAtomicCandleAppend } from "../src/data/indexeddb-candle-store.mjs";

const candle = (openTime, close = 10) => ({
  openTime, closeTime: openTime + 59_999,
  open: 9, high: 11, low: 8, close, volume: 100
});

test("append plan adds only unseen candles", () => {
  const result = planAtomicCandleAppend([candle(0)], [candle(0), candle(60_000)]);
  assert.deepEqual(result.map(c => c.openTime), [60_000]);
});

test("append plan is idempotent for identical candles", () => {
  assert.deepEqual(planAtomicCandleAppend([candle(0)], [candle(0)]), []);
});

test("append plan rejects historical candle conflicts", () => {
  assert.throws(() => planAtomicCandleAppend([candle(0)], [candle(0, 12)]), /EXISTING_CANDLE_CONFLICT/);
});

test("append plan rejects invalid OHLC relationships", () => {
  assert.throws(() => planAtomicCandleAppend([], [{ ...candle(0), high: 7 }]), /OHLCV relationships/);
});

test("append plan sorts incoming candles chronologically", () => {
  const result = planAtomicCandleAppend([], [candle(60_000), candle(0)]);
  assert.deepEqual(result.map(c => c.openTime), [0, 60_000]);
});
