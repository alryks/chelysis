import { expect, test } from "bun:test";
import { importPgn } from "@chelysis/chess";
import { displayedEvaluation } from "../src/features/analysis/displayed-evaluation";
import { initialReview, reviewReducer } from "../src/features/analysis/state";
const evaluation = { move: "e2e4", score: 3, scoreType: "cp" as const };
test("bar changes once at classification and ignores the subsequent candidate search", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  state = reviewReducer(state, {
    type: "best",
    revision: state.revision,
    index: 0,
    moves: [evaluation],
  });
  state = reviewReducer(state, { type: "advance" });
  expect(displayedEvaluation(state)?.evaluation.score).toBe(3);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 0,
    evaluation: { ...evaluation, score: 2 },
    classification: "book",
  });
  expect(displayedEvaluation(state)?.evaluation.score).toBe(2);
  state = reviewReducer(state, {
    type: "best",
    revision: state.revision,
    index: 1,
    moves: [{ ...evaluation, score: -2.5 }],
  });
  expect(displayedEvaluation(state)?.evaluation.score).toBe(2);
  state = reviewReducer(state, { type: "advance" });
  expect(displayedEvaluation(state)?.evaluation.score).toBe(2);
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 1,
    evaluation: { ...evaluation, score: -1.5 },
    classification: "good",
  });
  expect(displayedEvaluation(state)).toMatchObject({
    evaluation: { score: -1.5 },
    turn: "b",
  });
});
test("branch creation retains only completed scores from the retained history", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 0,
    evaluation,
    classification: "book",
  });
  state = reviewReducer(state, { type: "navigate", cursor: 1 });
  state = reviewReducer(state, { type: "play", from: "c7", to: "c5" });
  expect(displayedEvaluation(state)).toMatchObject({ evaluation, turn: "w" });
  state = reviewReducer(state, {
    type: "import",
    line: importPgn("1. d4 d5 *"),
  });
  expect(displayedEvaluation(state)).toBeUndefined();
});
