import {
  emptyGame,
  playMove,
  type GameLine,
  type Evaluation,
  type Classification,
} from "@chelysis/chess";
import type { Square } from "chess.js";
export interface ReviewState {
  line: GameLine;
  original: GameLine;
  cursor: number;
  revision: number;
  reviewing: boolean;
  enabled: boolean;
  branch: boolean;
}
const initial = emptyGame();
export const initialReview: ReviewState = {
  line: initial,
  original: initial,
  cursor: 0,
  revision: 0,
  reviewing: false,
  enabled: false,
  branch: false,
};
export type ReviewAction =
  | { type: "import"; line: GameLine }
  | { type: "navigate"; cursor: number }
  | { type: "play"; from: Square; to: Square; promotion?: string }
  | { type: "restore" }
  | { type: "toggle-engine" }
  | { type: "stop" }
  | { type: "advance" }
  | { type: "best"; revision: number; index: number; moves: Evaluation[] }
  | {
      type: "classified";
      revision: number;
      index: number;
      evaluation: Evaluation;
      classification: Classification | null;
      nextMoves?: Evaluation[];
    };
export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
): ReviewState {
  switch (action.type) {
    case "import":
      return {
        ...state,
        line: action.line,
        original: action.line,
        cursor: 0,
        revision: state.revision + 1,
        reviewing: true,
        enabled: true,
        branch: false,
      };
    case "navigate":
      return {
        ...state,
        cursor: Math.max(
          0,
          Math.min(action.cursor, state.line.positions.length - 1),
        ),
        reviewing: false,
      };
    case "play": {
      if (state.reviewing) return state;
      const line = playMove(
        state.line,
        state.cursor,
        action.from,
        action.to,
        action.promotion,
      );
      return {
        ...state,
        line,
        cursor: state.cursor + 1,
        revision: state.revision + 1,
        branch: state.branch || line !== state.line,
      };
    }
    case "restore":
      return {
        ...state,
        line: state.original,
        cursor: Math.min(state.cursor, state.original.positions.length - 1),
        revision: state.revision + 1,
        reviewing: false,
        branch: false,
      };
    case "toggle-engine":
      return { ...state, enabled: !state.enabled, reviewing: false };
    case "stop":
      return { ...state, enabled: false, reviewing: false };
    case "advance":
      return state.cursor < state.line.positions.length - 1
        ? { ...state, cursor: state.cursor + 1 }
        : { ...state, reviewing: false };
    case "best":
    case "classified": {
      if (action.revision !== state.revision) return state;
      const positions = [...state.line.positions];
      const position = positions[action.index];
      if (!position) return state;
      positions[action.index] =
        action.type === "best"
          ? { ...position, bestMoves: action.moves }
          : {
              ...position,
              playedMove: {
                ...action.evaluation,
                classification: action.classification,
              },
            };
      if (
        action.type === "classified" &&
        action.nextMoves &&
        positions[action.index + 1]
      ) {
        positions[action.index + 1] = {
          ...positions[action.index + 1],
          bestMoves: action.nextMoves,
        };
      }
      const line = { ...state.line, positions };
      const reviewComplete =
        action.type === "classified" &&
        positions.slice(0, -1).every((position) => position.playedMove);
      return {
        ...state,
        line,
        original: state.branch ? state.original : line,
        // Commit the board move and its classification together during review.
        cursor:
          state.reviewing &&
          action.type === "classified" &&
          action.index === state.cursor
            ? Math.min(state.cursor + 1, positions.length - 1)
            : state.cursor,
        reviewing: reviewComplete ? false : state.reviewing,
      };
    }
  }
}
