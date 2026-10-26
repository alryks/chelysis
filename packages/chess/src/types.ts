export const classifications = [
  "brilliant",
  "greatFind",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
  "forced",
] as const;
export type Classification = (typeof classifications)[number];
/** Scores are in pawn units, from the side-to-move perspective; mate scores are moves to mate. */
export interface Evaluation {
  move: string;
  score: number;
  scoreType: "cp" | "mate";
  depth?: number;
}
export interface PreviousPosition {
  playedMove: {
    move: { classification: Classification | "normal" | null };
  } | null;
}
export interface PositionAnalysis {
  bestMoves: Evaluation[];
  playedMove: Evaluation;
}
