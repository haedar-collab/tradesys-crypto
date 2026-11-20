/**
 * IndexedDB cache for validated historical candle batches.
 * Browser-only persistence adapter; no network or exchange credentials.
 */
const DB_VERSION = 1;
const STORE = "kline-batches";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}
function validBatch(batch) {
  return batch && typeof batch === "object" && batch.status === "PASS" &&
    typeof batch.symbol === "string" && typeof batch.interval === "string" &&
    Number.isFinite(batch.asOf) && Array.isArray(batch.candles) &&
    batch.candles.every(c => Number.isFinite(c.openTime) && Number.isFinite(c.closeTime));
}
export function createIndexedDbKlineCache({ indexedDBImpl = globalThis.indexedDB, dbName = "tradesys-crypto-marketdata" } = {}) {
  if (!indexedDBImpl) throw new Error("IndexedDB is unavailable in this environment");
  let dbPromise;
  const open = () => {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDBImpl.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("symbolInterval", ["symbol", "interval"], { unique: false });
          store.createIndex("rangeStart", "startTime", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Unable to open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  };
  return {
    async put(batch) {
      if (!validBatch(batch)) throw new TypeError("Only structurally validated PASS batches can be cached");
      const db = await open();
      const key = [batch.symbol, batch.interval, batch.requested?.startTime ?? "", batch.requested?.endTime ?? ""].join(":");
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, symbol: batch.symbol, interval: batch.interval,
        startTime: batch.requested?.startTime ?? null, endTime: batch.requested?.endTime ?? null,
        storedAt: Date.now(), batch });
      await transactionDone(tx);
      return key;
    },
    async get(key) {
      const db = await open();
      const tx = db.transaction(STORE, "readonly");
      const result = await requestResult(tx.objectStore(STORE).get(key));
      await transactionDone(tx);
      return result?.batch ?? null;
    },
    async delete(key) {
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      await transactionDone(tx);
    },
    async clear() {
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await transactionDone(tx);
    },
    async close() {
      if (dbPromise) (await dbPromise).close();
      dbPromise = null;
    }
  };
}
