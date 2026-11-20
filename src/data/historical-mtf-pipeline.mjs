import {fetchHistoricalKlines} from "./binance-historical-klines.mjs";
import {klineCacheKey} from "./indexeddb-kline-cache.mjs";
import {toStrategyCandles,validateTimeframeBatchSet} from "./strategy-candle-adapter.mjs";
const FRAMES=[{key:"weekly",interval:"1w"},{key:"daily",interval:"1d"},{key:"h4",interval:"4h"},{key:"h1",interval:"1h"}];
export async function loadHistoricalMtfDataset({symbol,ranges,asOf=Date.now(),cache=null,fetchOptions={}}={}){
 if(!symbol||!ranges||typeof ranges!=="object")throw new TypeError("symbol and per-timeframe ranges are required");
 const batches={},errors=[];
 for(const f of FRAMES){const range=ranges[f.key];if(!range||!Number.isFinite(range.startTime)||!Number.isFinite(range.endTime)){errors.push({timeframe:f.key,code:"MISSING_RANGE"});continue;}
 const key=klineCacheKey(symbol,f.interval,range.startTime,range.endTime);
 try{let batch=await cache?.get?.(key);if(batch&&(batch.asOf!==asOf||batch.status!=="PASS"))batch=null;
 if(!batch){batch=await fetchHistoricalKlines({...fetchOptions,symbol,interval:f.interval,startTime:range.startTime,endTime:range.endTime,asOf});if(batch.status==="PASS")await cache?.put?.(batch);}else batch={...batch,cacheHit:true};
 batches[f.key]=batch;if(batch.status!=="PASS")errors.push({timeframe:f.key,code:"DATA_VALIDATION_FAILED",details:batch.errors});
 }catch(e){errors.push({timeframe:f.key,code:"FETCH_FAILED",message:e.message});}}
 const intervalBatches=Object.fromEntries(FRAMES.map(f=>[f.interval,batches[f.key]]).filter(([,v])=>v));
 const temporal=validateTimeframeBatchSet(intervalBatches,{asOf,required:FRAMES.map(f=>f.interval)});
 if(temporal.status!=="PASS")errors.push({code:"TIMEFRAME_SET_INVALID",...temporal});
 const canonical={};for(const f of FRAMES){const b=batches[f.key];if(b?.status==="PASS")canonical[f.key]=toStrategyCandles(b);}
 return {status:errors.length?"FAIL":"PASS",mode:"binance-spot-historical-data",symbol:symbol.toUpperCase(),asOf,batches,canonical,errors,assumptions:{source:"Binance Spot public klines",cache:cache?"async persistent cache supplied":"disabled",candlePolicy:"closed candles only; closeTime strictly less than asOf",execution:"data only; no orders or fills"}};
}