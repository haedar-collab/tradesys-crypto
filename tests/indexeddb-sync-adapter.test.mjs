import test from "node:test";
import assert from "node:assert/strict";
import { syncIndexedDbKlines } from "../src/data/indexeddb-sync-adapter.mjs";

const candle = (openTime, close = 10) => ({
  openTime, closeTime: openTime + 59_999,
  open: 9, high: 11, low: 8, close, volume: 100
});
const base = {
  symbol: "BTCUSDT", interval: "1m", startTime: 0, endTime: 120_000, asOf: 1_000_000
};

test("adapter wires latest cursor and append operation", async () => {
  let appended;
  const result = await syncIndexedDbKlines({
    ...base,
    store: {
      readLatest: async () => candle(0),
      appendCandles: async value => { appended = value; return { status: "APPENDED", appendedCount: value.candles.length }; }
    },
    fetchRange: async () => ({ status: "PASS", candles: [candle(0), candle(60_000)], errors: [] })
  });
  assert.equal(result.status, "SYNCED");
  assert.equal(appended.candles.length, 1);
  assert.equal(appended.candles[0].openTime, 60_000);
});

test("adapter rejects incomplete store contract", async () => {
  await assert.rejects(() => syncIndexedDbKlines({
    ...base, store: { readLatest: async () => null }
  }), /compatible IndexedDB candle store/);
});
