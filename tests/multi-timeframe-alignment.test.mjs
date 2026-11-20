import test from "node:test";
import assert from "node:assert/strict";
import { alignMultiTimeframeCandles, toAlignedStrategyContext } from "../src/data/multi-timeframe-alignment.mjs";

const duration = { "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };
const candle = (interval, openTime, closed = true) => ({
  openTime, closeTime: openTime + duration[interval] - 1,
  open: 10, high: 12, low: 9, close: 11, volume: 100, closed
});
const batch = candles => ({ status: "PASS", candles });

test("aligns latest fully closed candle for all required timeframes", () => {
  const decisionTime = 1_814_400_000;
  const batches = Object.fromEntries(Object.keys(duration).map(tf =>
    [tf, batch([candle(tf, decisionTime - duration[tf] - 1)])]));
  const result = alignMultiTimeframeCandles(batches, { decisionTime });
  assert.equal(result.status, "PASS");
  for (const tf of Object.keys(duration)) assert.ok(result.selected[tf].closeTime < decisionTime);
});

test("never selects a candle closing at or after decision time", () => {
  const decisionTime = 7_200_000;
  const batches = { "1h": batch([candle("1h", 0), candle("1h", 3_600_000)]) };
  const result = alignMultiTimeframeCandles(batches, {
    decisionTime, required: ["1h"], maxAgeMultiples: 2
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.selected["1h"].openTime, 0);
});

test("fails when a required timeframe is missing", () => {
  const result = alignMultiTimeframeCandles({}, { decisionTime: 10_000_000 });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.missing, ["1w", "1d", "4h", "1h"]);
});

test("fails when batch is not validated", () => {
  const result = alignMultiTimeframeCandles({ "1h": { status: "FAIL", candles: [] } }, {
    decisionTime: 10_000_000, required: ["1h"]
  });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.invalid, ["1h"]);
});

test("fails when timeframe data is stale", () => {
  const result = alignMultiTimeframeCandles({ "1h": batch([candle("1h", 0)]) }, {
    decisionTime: 20_000_000, required: ["1h"]
  });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.stale, ["1h"]);
});

test("rejects malformed candle duration and unsorted input", () => {
  const bad = { ...candle("1h", 0), closeTime: 100 };
  const result = alignMultiTimeframeCandles({ "1h": batch([bad]) }, {
    decisionTime: 10_000_000, required: ["1h"]
  });
  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.invalid, ["1h"]);
});

test("strategy context requires PASS alignment and retains decision cutoff", () => {
  const decisionTime = 7_200_000;
  const alignment = alignMultiTimeframeCandles({
    "1h": batch([candle("1h", 0)])
  }, { decisionTime, required: ["1h"], maxAgeMultiples: 2 });
  const context = toAlignedStrategyContext(alignment);
  assert.equal(context.decisionTime, decisionTime);
  assert.throws(() => toAlignedStrategyContext({ status: "FAIL" }), /PASS/);
});
