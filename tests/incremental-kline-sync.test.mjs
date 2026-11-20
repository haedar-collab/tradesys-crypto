import test from "node:test";
import assert from "node:assert/strict";
import { syncIncrementalKlines } from "../src/data/incremental-kline-sync.mjs";

const candle = (openTime, close = 10) => ({
  openTime, closeTime: openTime + 59_999, open: 9, high: 11,
  low: 8, close, volume: 100, closed: true
});
const batch = candles => ({ status: "PASS", candles, errors: [] });
const base = {
  symbol: "BTCUSDT", interval: "1m", startTime: 0, endTime: 180_000, asOf: 1_000_000
};

test("initial sync persists a validated complete batch", async () => {
  let written;
  const result = await syncIncrementalKlines({
    ...base, readLatest: async () => null,
    fetchRange: async () => batch([candle(0), candle(60_000)]),
    persistCandles: async value => { written = value; return { id: "snapshot-1" }; }
  });
  assert.equal(result.status, "SYNCED");
  assert.equal(result.appendedCount, 2);
  assert.equal(written.mode, "INITIAL");
});

test("incremental sync overlaps last candle and appends only newer candles", async () => {
  const latest = candle(0);
  let written;
  const result = await syncIncrementalKlines({
    ...base, readLatest: async () => latest,
    fetchRange: async ({ startTime }) => {
      assert.equal(startTime, latest.openTime);
      return batch([candle(0), candle(60_000), candle(120_000)]);
    },
    persistCandles: async value => { written = value; }
  });
  assert.equal(result.status, "SYNCED");
  assert.equal(result.fetchedCount, 3);
  assert.equal(result.appendedCount, 2);
  assert.deepEqual(written.candles.map(c => c.openTime), [60_000, 120_000]);
  assert.equal(written.mode, "APPEND");
});

test("overlap mismatch stops without writing", async () => {
  let writes = 0;
  const result = await syncIncrementalKlines({
    ...base, readLatest: async () => candle(0),
    fetchRange: async () => batch([candle(0, 12), candle(60_000)]),
    persistCandles: async () => { writes++; }
  });
  assert.equal(result.reason, "OVERLAP_MISMATCH");
  assert.equal(writes, 0);
});

test("incremental gap stops without writing", async () => {
  let writes = 0;
  const result = await syncIncrementalKlines({
    ...base, readLatest: async () => candle(0),
    fetchRange: async () => batch([candle(0), candle(120_000)]),
    persistCandles: async () => { writes++; }
  });
  assert.equal(result.reason, "INCREMENTAL_GAP");
  assert.equal(writes, 0);
});

test("returns no-op when no new closed candles exist", async () => {
  const result = await syncIncrementalKlines({
    ...base, readLatest: async () => candle(0),
    fetchRange: async () => batch([candle(0)]),
    persistCandles: async () => assert.fail("must not write")
  });
  assert.equal(result.status, "NOOP");
  assert.equal(result.reason, "ALREADY_UP_TO_DATE");
});

test("rejects invalid configuration before fetching", async () => {
  await assert.rejects(() => syncIncrementalKlines({
    ...base, interval: "1M", readLatest: async () => null,
    persistCandles: async () => {}, fetchRange: async () => batch([])
  }), /Unsupported interval/);
});
