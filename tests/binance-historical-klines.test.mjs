import test from "node:test";
import assert from "node:assert/strict";
import { validateKlineRows, fetchHistoricalKlines, createMemoryKlineCache } from "../src/data/binance-historical-klines.mjs";

const row = (t, closeTime = t + 59_999, close = 10) => [t, "9", "11", "8", String(close), "100", closeTime, "1000"];

test("validator keeps only closed, valid candles", () => {
  const result = validateKlineRows([row(0), row(60_000)], { interval: "1m", asOf: 60_000 });
  assert.equal(result.status, "PASS");
  assert.equal(result.candles.length, 1);
});

test("validator detects gaps and duplicate timestamps", () => {
  const gap = validateKlineRows([row(0), row(120_000)], { interval: "1m", asOf: 999_999 });
  assert.equal(gap.errors.some(x => x.code === "CANDLE_GAP"), true);
  const duplicate = validateKlineRows([row(0), row(0)], { interval: "1m", asOf: 999_999 });
  assert.equal(duplicate.errors.some(x => x.code === "DUPLICATE_OPEN_TIME"), true);
});

test("fetcher paginates with advancing open-time cursor and caches validated result", async () => {
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    const start = Number(new URL(url).searchParams.get("startTime"));
    return { ok: true, json: async () => start === 0 ? [row(0), row(60_000)] : [row(120_000)] };
  };
  const cache = createMemoryKlineCache();
  const result = await fetchHistoricalKlines({ symbol: "BTCUSDT", interval: "1m",
    startTime: 0, endTime: 120_000, asOf: 1_000_000, limit: 2,
    fetchImpl, baseUrls: ["https://example.test"], cache });
  assert.equal(result.status, "PASS");
  assert.equal(result.candles.length, 3);
  assert.equal(result.pages, 2);
  const again = await fetchHistoricalKlines({ symbol: "BTCUSDT", interval: "1m",
    startTime: 0, endTime: 120_000, asOf: 1_000_000, limit: 2,
    fetchImpl, baseUrls: ["https://example.test"], cache });
  assert.equal(again.cacheHit, true);
  assert.equal(calls, 2);
});

test("fetcher rejects non-advancing pagination", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [row(0)] });
  await assert.rejects(() => fetchHistoricalKlines({ symbol: "BTCUSDT", interval: "1m",
    startTime: 0, endTime: 120_000, asOf: 1_000_000, limit: 1, fetchImpl: async () => ({ ok: true, json: async () => [row(0), row(60_000)] }),
    baseUrls: ["https://example.test"], maxPages: 2 }), /Maximum pagination|pagination/);
});
