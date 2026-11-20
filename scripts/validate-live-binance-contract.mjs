import {writeFile,mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {loadHistoricalMtfDataset} from "../src/data/historical-mtf-pipeline.mjs";
import {buildStrategyDataContract} from "../src/data/strategy-contract-v1.mjs";

const symbol=(process.env.SYMBOL||"BTCUSDT").toUpperCase();
const asOf=Date.now();
const intervals={weekly:604800000,daily:86400000,h4:14400000,h1:3600000};
const bars=Number(process.env.BARS_PER_TIMEFRAME||250);
if(!Number.isInteger(bars)||bars<210||bars>1000)throw new Error("BARS_PER_TIMEFRAME must be between 210 and 1000 to support strategy warmup");
const ranges=Object.fromEntries(Object.entries(intervals).map(([key,ms])=>{\n const anchor=key==="weekly"?3*86400000:0;\n const startTime=Math.floor((asOf-bars*ms-anchor)/ms)*ms+anchor;\n return [key,{startTime,endTime:asOf}];\n}));
const dataset=await loadHistoricalMtfDataset({symbol,ranges,asOf,fetchOptions:{timeoutMs:15000,maxPages:2}});
if(dataset.status!=="PASS")throw new Error("Historical dataset rejected: "+JSON.stringify(dataset.errors));
const payload=buildStrategyDataContract(dataset,{evaluationTimes:[asOf]});
const output=resolve(process.env.OUTPUT_FILE??"artifacts/binance-spot-contract-v1.json");
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(payload,null,2)+"\n");
const counts=Object.fromEntries(Object.entries(dataset.canonical).map(([k,v])=>[k,v.length]));
process.stdout.write(JSON.stringify({status:"PASS",symbol,asOf,counts,output,contractVersion:payload.schema_version},null,2)+"\n");
