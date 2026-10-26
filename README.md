# Chelysis

A chess analysis workspace built with Next.js, TypeScript, Bun, and Stockfish.js 19. Original logo, opening database, classification thresholds, sacrifice search, accuracy formula, and great-find/missed-opportunity rules are preserved.

## Structure

```text
frontend/          Next.js application and browser engine adapter
packages/chess/    Shared TypeScript classification rules, game helpers, and opening data
assets/logo.ai     Original editable logo source
Dockerfile         Development, test, build, and production stages
compose.yaml       Production at localhost:3000
compose.dev.yaml   Hot-reload development at localhost:3001
compose.test.yaml  Isolated tests, type checks, and lint
```

## Local development

Requires Bun 1.3.14 or later.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. Stockfish assets are prepared automatically before development/build. No external fonts or runtime CDNs are required.

```sh
bun run test
bun run typecheck
bun run lint
bun run build
bun run start
```

## Docker

Production builds a standalone Next.js app, runs as an unprivileged Bun user, and has no source bind mounts:

```sh
docker compose up --build -d
# http://localhost:3000
docker compose down
```

Development runs separately with hot-reloading source mounts:

```sh
docker compose -f compose.dev.yaml up --build
# http://localhost:3001
docker compose -f compose.dev.yaml down
```

Run isolated tests, strict TypeScript checks, and ESLint (no published ports):

```sh
docker compose -f compose.test.yaml run --build --rm tests
```

The three Compose files are independent; use the commands above, rather than merging them with multiple `-f` flags. Dependency layers are cached independently of application source.

## Engine and chess behavior

Stockfish.js is pinned to **19.0.1**, using the **Stockfish 19 Full multithreaded** WASM build (approximately 94 MB). The full neural network favors analysis strength over download size. Next.js sends cross-origin isolation headers in both development and production so the browser can use shared memory. The engine uses up to four threads, leaving one logical CPU available when possible. Evaluations differ from the old Stockfish 16.1; classification rules are unchanged. Analysis uses depth 12, up to five candidate lines, and reuses candidate scores for played moves already in those lines. Only played moves outside the candidate list require a separate single-line search.

The engine preloads, reuses the worker, serializes searches, drains cancelled requests, and caches results by full history and search settings. Replaying game history retains setup FEN, side to move, castling, en passant, promotion, and repetition. Alternative moves are classified automatically; “Return to game” restores the imported line. Arrow keys navigate, X flips the board, and S toggles analysis. Shortcuts do not run while typing.

Original classification code is frozen as a test-only behavioral oracle. Regression tests compare the shared implementation with that original across scores, mate evaluations, and deterministic legal positions. Engine upgrades can change labels through changed evaluations even when rules are identical.

## Stockfish attribution

Stockfish.js is GPL-3.0. The application serves the unmodified package license and exact source/build links at `/stockfish/COPYING.txt` and `/stockfish/SOURCE.txt`, accessible from the interface. Engine assets are generated from the lockfile-pinned package during builds.
