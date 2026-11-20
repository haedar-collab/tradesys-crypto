# Tradesys Crypto — Architecture & Strategy Separation

Status: architecture baseline (not a strategy validation or production-readiness claim).

## 1. Product boundary

- **Application repository:** `haedar-collab/tradesys-crypto`
  - UI, navigation, user settings, data adapters, persistence, notifications, journal, portfolio views, orchestration, observability.
  - Must not own canonical trading rules or silently alter strategy parameters.
- **Dedicated strategy repository (planned):** `haedar-collab/tradesys-crypto-strategy`
  - Canonical strategy specifications, versioned rule sets, regime/selection/SMC/confirmation/entry/exit/risk decision logic, deterministic test fixtures, and validation reports.
  - This repository does not yet exist. Create it separately before moving strategy logic; do not treat `crypto-intelligence-system` as a strategy-only repository.
- **Existing reference repository:** `haedar-collab/crypto-intelligence-system`
  - A separate crypto research application with `index.html`, `engine.js`, and `shim.js`; it is a reference implementation, not the canonical strategy package.
  - Its README reports the latest signal-rule backtest as **NO EDGE** and says BUY is blocked. Preserve that warning until independently revalidated.
- **Precision Zone research:** keep `precision-zone-system-trading` and `precision-zone-knowledge-base` separate. Integrate Precision Zone only through a versioned adapter after its rules and evidence are mapped.

## 2. Dependency direction

```text
Binance public market data / optional public reference data
                      |
                      v
             Application data layer
       (fetch, normalize, validate, timestamp)
                      |
                      v
            Strategy adapter interface
                      |
                      v
          tradesys-crypto-strategy package
  (regime -> universe/relative strength -> structure/SMC
   -> setup quality -> trigger -> entry/exit -> risk)
                      |
                      v
             Decision / signal contract
                      |
          +-----------+-----------+
          |                       |
          v                       v
    Application UI          Audit & research log
  dashboard / alerts        inputs / outputs / version
          |
          v
  journal / paper portfolio

No live order execution in this development scope.
```

The strategy package must not call browser APIs, access localStorage/IndexedDB, fetch market data directly, send notifications, or place exchange orders. It receives normalized snapshots and returns deterministic analysis results.

## 3. Strategy adapter contract (v1)

Input object:
- `schema_version`: contract version.
- `as_of`: UTC timestamp of the decision snapshot.
- `venue`: exchange and market type (Binance Spot).
- `universe`: eligible symbols and exchange filters.
- `market`: normalized OHLCV by symbol/timeframe, with candle open/close timestamps and explicit closed/forming status.
- `context`: BTC market regime inputs, benchmark data, event-risk flags, and optional reference metrics.
- `account`: user-configured capital and risk limits; never exchange credentials.

Output object:
- `schema_version`, `strategy_id`, `strategy_version`, `evaluated_at`.
- `market_regime` and `universe_decisions`.
- `setups[]`: symbol, direction (Spot long-only), state, evidence, invalidation, entry zone, stop, targets, reward/risk, and expiry.
- `risk_decision`: allowed/blocked, reason codes, position sizing inputs and exposure constraints.
- `data_quality`: missing/stale/invalid inputs and warnings.
- `audit`: rule IDs and parameter-set hash for reproducibility.

A missing, stale, or invalid critical input must result in a non-actionable state (for example `WAIT_DATA` or `BLOCKED`), never a guessed BUY signal. No signal may be presented as guaranteed or as proof of profitability.

## 4. Proposed module boundaries

Application repository:
- `src/app/` — app shell, routes, state, user workflows.
- `src/data/binance/` — public REST/WebSocket adapters and exchange metadata.
- `src/data/normalization/` — OHLCV normalization, timestamp alignment, quality gates.
- `src/persistence/` — settings, journal, paper portfolio, backup/restore.
- `src/strategy-adapter/` — contract validation and strategy package integration.
- `src/alerts/` — browser notifications and optional external alert transport.
- `tests/` — app, adapter, data-quality, and integration tests.

Strategy repository:
- `specs/` — rule definitions and decision-state machine.
- `src/` — pure deterministic calculations and orchestration.
- `schemas/` — input/output JSON schemas.
- `fixtures/` — known market scenarios and expected decisions.
- `tests/` — unit, regression, boundary, and anti-lookahead tests.
- `research/` — reproducible backtest and walk-forward reports.
- `CHANGELOG.md` — strategy changes and migration notes.

This is a target structure. Do not move or delete the existing single-file app until parity tests pass.

## 5. Non-negotiable validation gates

1. Data: ascending timestamps, no duplicate candles, OHLC consistency, explicit candle closure, gap/staleness detection, exchange symbol filters.
2. Lookahead: pivots/swings become available only after confirmation; no use of future candles when computing historical decisions.
3. Execution simulation: fees, spread, slippage, realistic fills, candle ambiguity when stop and target are both touched, and no optimistic same-bar assumptions.
4. Research: chronological train/validation/out-of-sample split, walk-forward tests, sufficient trades, regime breakdown, benchmark comparison, parameter sensitivity, and drawdown analysis.
5. Risk: quantity derived from stop distance and risk budget; enforce max exposure, correlation, concurrent positions, and daily/overall drawdown limits.
6. Release: BUY remains disabled until acceptance criteria are met on untouched out-of-sample data. A backtest passing is not proof of future profitability.

## 6. Migration sequence

- Phase 0 — Freeze and inventory current `index.html`; preserve a known-good baseline.
- Phase 1 — Extract a complete function/dependency map and document current behavior.
- Phase 2 — Define and test the v1 adapter schemas with fixtures.
- Phase 3 — Create the dedicated strategy repository and move strategy specifications/tests first.
- Phase 4 — Extract pure strategy logic behind the adapter; compare outputs against the frozen baseline.
- Phase 5 — Add data-quality and anti-lookahead tests, then independent backtest validation.
- Phase 6 — Integrate validated strategy versions into the application; retain rollback capability.
- Phase 7 — UI, alerting, paper trading, deployment, backup/restore, and operational monitoring.

## 7. Current repository facts and caveats

- The current Tradesys Crypto repository is a single-file browser app (`index.html`) plus README.
- Its README describes a Binance Spot, long-only, signal-only workflow and claims a separate GitHub Actions Telegram alert workflow. Verify the workflow actually exists before relying on background alerts.
- Static repository inspection is not runtime testing. Do not describe the application or strategy as production-ready until automated tests and runtime checks pass.
