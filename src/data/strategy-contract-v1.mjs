const KEYS=["weekly","daily","h4","h1"];
export const TRADESYS_DATA_CONTRACT_VERSION="1.0.0";
/**
 * Build a transport-safe v1 payload for the separate strategy repository.
 * Data rows are canonical OHLCV with UTC epoch-millisecond timestamps.
 */
export function buildStrategyDataContract(dataset,{evaluationTimes,symbolStatus="TRADING",quoteAsset="USDT"}={}){
 if(!dataset||dataset.status!=="PASS")throw new TypeError("A PASS historical MTF dataset is required");
 if(!Array.isArray(evaluationTimes)||!evaluationTimes.length||evaluationTimes.some((t,i)=>!Number.isFinite(t)||(i&&t<=evaluationTimes[i-1])))throw new RangeError("evaluationTimes must be finite and strictly increasing");
 for(const key of KEYS)if(!Array.isArray(dataset.canonical?.[key]))throw new TypeError(`Missing canonical timeframe: ${key}`);
 const market={};for(const key of KEYS)market[key]=dataset.canonical[key].map(c=>({openTime:c.openTime,closeTime:c.closeTime,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume,closed:c.closed===true}));
 return Object.freeze({
  schema_version:TRADESYS_DATA_CONTRACT_VERSION,
  as_of:new Date(dataset.asOf).toISOString(),
  venue:{exchange:"BINANCE",market_type:"SPOT"},
  universe:[{symbol:dataset.symbol,quote_asset:quoteAsset,status:symbolStatus}],
  market:{[dataset.symbol]:market},
  context:{source:"BINANCE_PUBLIC_KLINES",data_mode:"HISTORICAL_RESEARCH",evaluation_times_ms:[...evaluationTimes],timeframes:["weekly","daily","h4","h1"],candle_close_policy:"closeTime < evaluation_time"},
 });
}
