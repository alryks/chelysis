import type { Evaluation } from "@chelysis/chess";
import type { ReviewState } from "./state";
export interface DisplayEvaluation {
  evaluation: Evaluation;
  turn: "w" | "b";
}
/** Commit the bar once per classified move; retain the preceding completed score while waiting. */
export function displayedEvaluation(
  state: ReviewState,
): DisplayEvaluation | undefined {
  for (let index = state.cursor - 1; index >= 0; index--) {
    const position = state.line.positions[index];
    if (position.playedMove)
      return {
        evaluation: position.playedMove,
        turn: position.fen.split(" ")[1] as "w" | "b",
      };
  }
  const initial = state.line.positions[0];
  if (initial.bestMoves?.[0])
    return {
      evaluation: initial.bestMoves[0],
      turn: initial.fen.split(" ")[1] as "w" | "b",
    };
  return undefined;
}
