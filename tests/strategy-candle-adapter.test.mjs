import test from "node:test";
import assert from "node:assert/strict";
import { toStrategyCandles, validateTimeframeBatchSet } from "../src/data/strategy-candle-adapter.mjs";

const candle = (openTime, closeTime) => ({ openTime, closeTime, open: 10, high: 12, low: 9, close: 11, volume: 100, closed: true });
test("canonical adapter preserves millisecond timestamps and freezes rows", () => {
 const rows = toStrategyCandles({status:"PASS",candles:[candle(0,59_999)]});
 assert.equal(rows[0].openTime,0); assert.equal(rows[0].closeTime,59_999);
 assert.equal(rows[0].source,"BINANCE_SPOT"); assert.equal(Object.isFrozen(rows[0]),true);
});
test("canonical adapter rejects unvalidated or malformed batches", () => {
 assert.throws(()=>toStrategyCandles({status:"FAIL",candles:[]}),/PASS/);
 assert.throws(()=>toStrategyCandles({status:"PASS",candles:[candle(100,90)]}),/Invalid canonical/);
});
test("timeframe batch gate requires all closed data strictly before asOf", () => {
 const ok=Object.fromEntries(["1w","1d","4h","1h"].map(k=>[k,{status:"PASS",candles:[candle(1,9)]}]));
 assert.equal(validateTimeframeBatchSet(ok,{asOf:10}).status,"PASS");
 ok["4h"]={status:"PASS",candles:[candle(1,10)]};
 assert.deepEqual(validateTimeframeBatchSet(ok,{asOf:10}).invalid,["4h"]);
});
