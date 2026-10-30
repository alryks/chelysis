# Chelysis frontend

Next.js App Router, React, strict TypeScript, and Bun. Run commands from the repository root; see [the main README](../README.md) for local and Docker workflows.

- `src/app/`: route, document metadata, global styles.
- `src/features/analysis/`: board, promotion picker, evaluation bar, game import, review state, and interface.
- `src/lib/classification/`: reusable classification worker and abortable client; cancelled searches terminate immediately.
- `src/lib/engine/`: typed UCI worker adapter with initialization, cancellation, serialized searches, and bounded cache.
- `public/brand/`, `public/classification/`: original unmodified logo and classification icons.
- `public/stockfish/`: generated from the pinned Stockfish package by `scripts/prepare-engine.ts`; never hand-edit or commit it.
- `tests/`: engine protocol and state regression tests.

Classification formulas, opening data, and game-history helpers live in the shared `@chelysis/chess` workspace, outside this application.
