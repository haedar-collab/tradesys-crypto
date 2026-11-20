/**
 * IndexedDB cache for validated historical candle batches.
 */
const DB_VERSION=1, STORE="kline-batches";
const reqResult=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error("IndexedDB request failed"));});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error("IndexedDB transaction aborted"));});
function validBatch(b){return b&&b.status==="PASS"&&typeof b.symbol==="string"&&typeof b.interval==="string"&&Number.isFinite(b.asOf)&&Array.isArray(b.candles)&&b.candles.every(c=>Number.isFinite(c.openTime)&&Number.isFinite(c.closeTime));}
export function klineCacheKey(symbol,interval,startTime,endTime){return [symbol.toUpperCase(),interval,startTime??"",endTime??""].join(":");}
export function createIndexedDbKlineCache({indexedDBImpl=globalThis.indexedDB,dbName="tradesys-crypto-marketdata",maxEntries=250,maxAgeMs=30*86400_000}={}){
 if(!indexedDBImpl)throw new Error("IndexedDB is unavailable in this environment");
 if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isFinite(maxAgeMs)||maxAgeMs<1)throw new TypeError("Invalid IndexedDB cache retention policy");
 let dbPromise;
 const open=()=>{if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDBImpl.open(dbName,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:"key"});s.createIndex("storedAt","storedAt");s.createIndex("symbolInterval",["symbol","interval"]);}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error("IndexedDB upgrade blocked"));}).catch(e=>{dbPromise=null;throw e;});return dbPromise;};
 async function prune(db){const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),records=await reqResult(store.getAll());records.sort((a,b)=>b.storedAt-a.storedAt);records.forEach((r,i)=>{if(Date.now()-r.storedAt>maxAgeMs||i>=maxEntries)store.delete(r.key);});await txDone(tx);}
 return {
 async put(batch){if(!validBatch(batch))throw new TypeError("Only validated PASS batches can be cached");const db=await open(),key=klineCacheKey(batch.symbol,batch.interval,batch.requested?.startTime,batch.requested?.endTime),tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({key,symbol:batch.symbol,interval:batch.interval,storedAt:Date.now(),batch});await txDone(tx);await prune(db);return key;},
 async get(key){const db=await open(),tx=db.transaction(STORE,"readonly"),record=await reqResult(tx.objectStore(STORE).get(key));await txDone(tx);if(!record)return null;if(Date.now()-record.storedAt>maxAgeMs){await this.delete(key);return null;}return record.batch;},
 async delete(key){const db=await open(),tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(key);await txDone(tx);},
 async clear(){const db=await open(),tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();await txDone(tx);},
 async prune(){await prune(await open());},
 async close(){if(dbPromise)(await dbPromise).close();dbPromise=null;}
 };}
