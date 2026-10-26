import { Chess, type Square } from "chess.js";
import type { Classification, Evaluation } from "./types";
import { calculateAccuracy } from "./classification";

export interface GamePosition {
  fen: string;
  /** UCI move and SAN leading out of this position. */
  move?: string;
  san?: string;
  bestMoves?: Evaluation[];
  playedMove?: Evaluation & { classification: Classification | null };
}
export interface GameLine {
  startingFen: string;
  positions: GamePosition[];
}
export function emptyGame(startingFen = new Chess().fen()): GameLine {
  return { startingFen, positions: [{ fen: startingFen }] };
}
export function importPgn(pgn: string): GameLine {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  const startingFen = history[0]?.before ?? game.fen();
  return {
    startingFen,
    positions: [
      ...history.map((move) => ({
        fen: move.before,
        move: move.lan,
        san: move.san,
      })),
      { fen: game.fen() },
    ],
  };
}
/** Replay history rather than using FEN alone, preserving repetition and setup positions. */
export function gameAt(line: GameLine, index: number): Chess {
  const game = new Chess(line.startingFen);
  for (const position of line.positions.slice(0, index)) {
    if (position.move) game.move(position.move);
  }
  return game;
}
export function playMove(
  line: GameLine,
  index: number,
  from: Square,
  to: Square,
  promotion?: string,
): GameLine {
  const game = gameAt(line, index);
  const move = game.move({ from, to, promotion });
  if (line.positions[index].move === move.lan && line.positions[index + 1])
    return line;
  return {
    ...line,
    positions: [
      ...line.positions.slice(0, index),
      {
        fen: line.positions[index].fen,
        bestMoves: line.positions[index].bestMoves,
        move: move.lan,
        san: move.san,
      },
      { fen: game.fen() },
    ],
  };
}
export function gameStatus(game: Chess): string {
  if (game.isCheckmate())
    return `Checkmate · ${game.turn() === "w" ? "Black" : "White"} wins`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isDrawByFiftyMoves()) return "Draw by the fifty-move rule";
  return `${game.turn() === "w" ? "White" : "Black"} to move${game.isCheck() ? " · Check" : ""}`;
}
export function accuracyByColor(line: GameLine) {
  const scores: Record<"w" | "b", number[]> = { w: [], b: [] };
  for (const position of line.positions) {
    if (
      !position.playedMove ||
      !position.bestMoves?.length ||
      position.playedMove.classification === "book"
    )
      continue;
    scores[new Chess(position.fen).turn()].push(
      calculateAccuracy(position.bestMoves[0], position.playedMove),
    );
  }
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 100;
  return { white: mean(scores.w), black: mean(scores.b) };
}
