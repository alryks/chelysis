import { expect, test } from "bun:test";
import { playedMoveEvaluation } from "../src/features/analysis/move-evaluation";
import { initialReview, reviewReducer } from "../src/features/analysis/state";
import { importPgn } from "@chelysis/chess";
const evaluation = { move: "e2e4", score: 0.3, scoreType: "cp" as const };
test("a candidate evaluation is reused without an additional Stockfish search", async () => {
  let searches = 0;
  const result = await playedMoveEvaluation([evaluation], "e2e4", async () => {
    searches++;
    return [];
  });
  expect(result).toBe(evaluation);
  expect(searches).toBe(0);
});
test("moves outside the evaluated candidates need exactly one restricted search", async () => {
  let searches = 0;
  const result = await playedMoveEvaluation([], "e2e4", async () => {
    searches++;
    return [evaluation];
  });
  expect(result).toBe(evaluation);
  expect(searches).toBe(1);
});
test("board, classification and next-position suggestions are committed together", () => {
  let state = reviewReducer(initialReview, {
    type: "import",
    line: importPgn("1. e4 e5 *"),
  });
  const replies = [{ move: "e7e5", score: -0.3, scoreType: "cp" as const }];
  state = reviewReducer(state, {
    type: "classified",
    revision: state.revision,
    index: 0,
    evaluation,
    classification: "book",
    nextMoves: replies,
  });
  expect(state.cursor).toBe(1);
  expect(state.line.positions[0].playedMove?.classification).toBe("book");
  expect(state.line.positions[state.cursor].bestMoves).toBe(replies);
  expect(state.reviewing).toBe(true);
});
