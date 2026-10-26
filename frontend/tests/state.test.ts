import { expect, test } from "bun:test";
import { importPgn } from "@chelysis/chess";
import { initialReview, reviewReducer } from "../src/features/analysis/state";

test("branch updates at the same cursor and ignores stale engine results", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *"),
  });
  state = reviewReducer(state, { type: "navigate", cursor: 4 });
  const oldRevision = state.revision;
  state = reviewReducer(state, { type: "play", from: "f1", to: "c4" });
  expect(state.line.positions[4].move).toBe("f1c4");
  expect(state.branch).toBe(true);
  const stale = reviewReducer(state, {
    type: "classified",
    revision: oldRevision,
    index: 4,
    evaluation: { move: "f1b5", score: 0, scoreType: "cp" },
    classification: "book",
  });
  expect(stale).toBe(state);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 4,
    evaluation: { move: "f1c4", score: 0.2, scoreType: "cp" },
    classification: "book",
  });
  expect(state.line.positions[4].playedMove?.classification).toBe("book");
  state = reviewReducer(state, { type: "restore" });
  expect(state.line.positions[4].move).toBe("f1b5");
  expect(state.branch).toBe(false);
});

test("game review completes with the last classification before final-position analysis", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 0,
    evaluation: { move: "e2e4", score: 0.3, scoreType: "cp" },
    classification: "book",
  });
  expect(state.reviewing).toBe(true);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 1,
    evaluation: { move: "e7e5", score: -0.3, scoreType: "cp" },
    classification: "book",
  });
  expect(state.reviewing).toBe(false);
  expect(state.enabled).toBe(true);
  expect(state.line.positions[2].bestMoves).toBeUndefined();
  // The independent position search can finish later without reopening review.
  state = reviewReducer(state, {
    type: "best",
    revision: state.revision,
    index: 2,
    moves: [{ move: "g1f3", score: 0.3, scoreType: "cp" }],
  });
  expect(state.reviewing).toBe(false);
});

test("classifying the last ply alone does not complete an unfinished game review", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 1,
    evaluation: { move: "e7e5", score: -0.3, scoreType: "cp" },
    classification: "book",
  });
  expect(state.reviewing).toBe(true);
});

test("review displays each move only when its classification is ready", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  expect(state.cursor).toBe(0);
  state = reviewReducer(state, {
    type: "best",
    revision: state.revision,
    index: 0,
    moves: [{ move: "e2e4", score: 0.3, scoreType: "cp" }],
  });
  expect(state.cursor).toBe(0);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 0,
    evaluation: { move: "e2e4", score: 0.3, scoreType: "cp" },
    classification: "book",
  });
  expect(state.cursor).toBe(1);
  expect(
    state.line.positions[state.cursor - 1].playedMove?.classification,
  ).toBe("book");
  state = reviewReducer(state, {
    type: "best",
    revision: state.revision,
    index: 1,
    moves: [{ move: "e7e5", score: -0.3, scoreType: "cp" }],
  });
  expect(state.cursor).toBe(1);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 1,
    evaluation: { move: "e7e5", score: -0.3, scoreType: "cp" },
    classification: "book",
  });
  expect(state.cursor).toBe(2);
  expect(state.reviewing).toBe(false);
  expect(state.line.positions[2].bestMoves).toBeUndefined();
});
