# Frontend Module Split Plan

This folder will host incremental extraction from index.html.

## Planned modules

- app/bootstrap.js
  - startup flow, event wiring, and first render
- core/state.js
  - localStorage-backed state, result locking, and backup import/export
- core/constants.js
  - shared constants (choice keys, day order, ranges, storage keys)
- services/validation.js
  - pre-run validator and related helpers
- engine/serpentine.js
  - runSerpentineLottery and engine-specific utilities
- views/resultsView.js
  - results tab render + diagnostics panel
- views/configView.js
- views/entryView.js
- views/wikiView.js

## Migration strategy

1. Extract pure helpers first (no DOM side effects).
2. Extract validation and lottery-engine helpers.
3. Extract individual tab renderers.
4. Move bootstrap/event wiring last.

Keep each extraction behavior-preserving and validate after each step.
