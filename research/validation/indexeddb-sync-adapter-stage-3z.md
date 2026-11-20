# Stage 3Z Integration Adapter

The IndexedDB candle store exposes readLatest and appendCandles. This adapter binds those methods to syncIncrementalKlines so callers can use the synchronizer without hand-writing persistence callbacks.

The adapter does not instantiate IndexedDB automatically. The application must create the store in a browser context and pass it in. Browser integration and multi-tab concurrency tests remain required.
