const DB_VERSION = 1;
const STORE = "klines";
const FIELDS = ["openTime", "closeTime", "open", "high", "low", "close", "volume"];

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});
const transactionDone = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
});

function validateCandle(candle) {
  if (!candle || !Number.isSafeInteger(candle.openTime) ||
      !Number.isFinite(candle.closeTime) || candle.closeTime <= candle.openTime ||
      !["open", "high", "low", "close", "volume"].every(k => Number.isFinite(Number(candle[k])))) {
    throw new TypeError("Invalid OHLCV candle");
  }
  const open = Number(candle.open), high = Number(candle.high);
  const low = Number(candle.low), close = Number(candle.close), volume = Number(candle.volume);
  if (low > Math.min(open, close) || high < Math.max(open, close) || low > high || volume < 0) {
    throw new RangeError("OHLCV relationships are invalid");
  }
}
function sameCandle(a, b) {
  return FIELDS.every(field => Number(a[field]) === Number(b[field]));
}
export function planAtomicCandleAppend(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) throw new TypeError("Candle arrays required");
  const byTime = new Map();
  for (const candle of existing) { validateCandle(candle); byTime.set(candle.openTime, candle); }
  const additions = [];
  for (const candle of [...incoming].sort((a,b) => a.openTime-b.openTime)) {
    validateCandle(candle);
    const previous = byTime.get(candle.openTime);
    if (previous) {
      if (!sameCandle(previous, candle)) throw new Error("EXISTING_CANDLE_CONFLICT");
      continue;
    }
    byTime.set(candle.openTime, candle);
    additions.push(candle);
  }
  return additions;
}

/**
 * Durable per-candle IndexedDB store.
 * appendCandles performs conflict detection and writes in one readwrite transaction.
 */
export function createIndexedDbCandleStore({
  indexedDBImpl = globalThis.indexedDB,
  dbName = "tradesys-crypto-candles-v1"
} = {}) {
  if (!indexedDBImpl) throw new Error("IndexedDB is unavailable in this environment");
  let dbPromise;
  const open = () => {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDBImpl.open(dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: ["symbol", "interval", "openTime"] });
          store.createIndex("symbolInterval", ["symbol", "interval"], { unique: false });
          store.createIndex("symbolIntervalOpenTime", ["symbol", "interval", "openTime"], { unique: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  };

  return {
    async readLatest({ symbol, interval }) {
      const db = await open();
      const tx = db.transaction(STORE, "readonly");
      const records = await requestResult(tx.objectStore(STORE).index("symbolInterval").getAll([symbol.toUpperCase(), interval]));
      await transactionDone(tx);
      records.sort((a,b) => b.openTime-a.openTime);
      return records[0] ?? null;
    },
    async readRange({ symbol, interval, startTime = 0, endTime = Number.MAX_SAFE_INTEGER }) {
      const db = await open();
      const tx = db.transaction(STORE, "readonly");
      const records = await requestResult(tx.objectStore(STORE).index("symbolInterval").getAll([symbol.toUpperCase(), interval]));
      await transactionDone(tx);
      return records.filter(c => c.openTime >= startTime && c.openTime <= endTime).sort((a,b) => a.openTime-b.openTime);
    },
    async appendCandles({ symbol, interval, candles }) {
      if (!Array.isArray(candles) || candles.length === 0) return { appendedCount: 0, status: "NOOP" };
      const normalized = symbol.toUpperCase();
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const index = store.index("symbolInterval");
      const existing = await requestResult(index.getAll([normalized, interval]));
      let additions;
      try { additions = planAtomicCandleAppend(existing, candles); }
      catch (error) { tx.abort(); throw error; }
      for (const candle of additions) store.put({ ...candle, symbol: normalized, interval });
      await transactionDone(tx);
      return { status: additions.length ? "APPENDED" : "NOOP", appendedCount: additions.length };
    },
    async close() {
      if (dbPromise) (await dbPromise).close();
      dbPromise = null;
    }
  };
}
