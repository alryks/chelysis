import { Chess, type Move, type Square } from "chess.js";
import openingsData from "./data/openings.json";
import type {
  Classification,
  Evaluation,
  PreviousPosition,
  PositionAnalysis,
} from "./types";
const openings: Record<string, { name: string; eco?: string }> = openingsData;
interface CaptureTree {
  value: number;
  move: Move | null;
  children: CaptureTree[];
  bestValue: number;
  bestMove: number;
}

export function findOpening(fen: string) {
  const opening = openings[fen];
  return opening || null;
}

export function calculateWinChance(score: number) {
  return 100 / (1 + Math.exp(-score / Math.E));
}

export function calculateAccuracy(bestEval: Evaluation, moveEval: Evaluation) {
  let value = null;
  if (bestEval.scoreType === "mate" && moveEval.scoreType === "mate") {
    if (bestEval.score > 0 && moveEval.score > 0) {
      value = 100;
    } else if (bestEval.score < 0 && moveEval.score < 0) {
      value = 100;
    } else if (bestEval.score > 0 && moveEval.score < 0) {
      value = 0;
    } else {
      value = 100;
    }
  } else if (bestEval.scoreType === "mate") {
    value = 0;
  } else if (moveEval.scoreType === "mate") {
    value = 0;
  }

  if (bestEval.move === moveEval.move) return 100;
  if (bestEval.score < moveEval.score) return 100;

  if (value === null) {
    const winChanceBest = calculateWinChance(bestEval.score);
    const winChanceMove = calculateWinChance(moveEval.score);
    const accuracy =
      100 * Math.exp(-(winChanceBest - winChanceMove) / Math.exp(2));
    return accuracy;
  } else {
    return value;
  }
}

const pieceCost = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: Infinity,
};

function lanToMove(game: Chess, lan: string) {
  const moves = game.moves({ verbose: true });
  for (const move of moves) {
    if (move.lan === lan) return move;
  }
  throw new Error(`Illegal move: ${lan}`);
}

function getCaptureTree(
  game: Chess,
  move: Move | null,
  value = 0,
  squares?: Set<Square>,
  alpha = -Infinity,
  beta = -Infinity,
  depth = 0,
): CaptureTree {
  const board = new Chess(game.fen());
  if (value !== 0) {
    value = -value;
  }

  let moves: (Move | null)[] = [];
  let legalMoves: Move[] | undefined;
  if (move) {
    board.move(move);

    if (!squares) {
      legalMoves = board.moves({ verbose: true });
      const firstMoves = legalMoves.filter((mv) => mv.captured);
      squares = new Set(firstMoves.map((mv) => mv.to));
      for (const mv of firstMoves) {
        board.move(mv);
        const secondMoves = board
          .moves({ verbose: true })
          .filter((mv) => mv.captured);
        for (const m of secondMoves) {
          squares.add(m.to);
        }
        board.undo();
      }
    }

    if (move.captured) {
      value += pieceCost[move.captured];
    }
    if (move.promotion) {
      value += pieceCost[move.promotion] - 1;
    }

    // Temporary captures above are undone, so the root move list is still valid.
    legalMoves ??= board.moves({ verbose: true });
    moves = legalMoves.filter((mv) => mv.captured && squares!.has(mv.to));
    if (moves.length < legalMoves.length && moves.length !== 0) {
      moves.push(null);
      if (value < 0 || depth === 12) moves = [];
    }
  }

  let bestValue = -Infinity;
  let bestMove = -1;

  const children = [];
  for (const [i, mv] of moves.entries()) {
    const tree = getCaptureTree(
      board,
      mv,
      value,
      squares
        ? squares
        : new Set(moves.filter((m) => m !== null).map((m) => m.to)),
      beta,
      alpha,
      depth + 1,
    );
    if (
      -tree.bestValue > bestValue ||
      (-tree.bestValue === bestValue && mv === null)
    ) {
      bestValue = tree.bestValue === 0 ? 0 : -tree.bestValue;
      bestMove = i;
    }
    children.push(tree);

    alpha = Math.max(alpha, bestValue);
    if (alpha >= -beta) break;
  }

  if (bestMove === -1) bestValue = value === 0 ? 0 : -value;

  return { value, move, children, bestValue, bestMove };
}

function isSacrifice(game: Chess, move: string, captureTree: CaptureTree) {
  const moveObj = lanToMove(game, move);

  let pawnTaken = false;
  let pieceCaptured = moveObj.captured !== undefined;

  let subTree = captureTree;
  let depth = 0;
  do {
    if (subTree.move && subTree.move.captured) {
      pieceCaptured = true;
      if (depth % 2 === 1 && subTree.move.captured === "p") pawnTaken = true;
    }
    if (subTree.bestMove === -1) break;
    subTree = subTree.children[subTree.bestMove];
    depth++;
  } while (true);

  return {
    sacrifice: captureTree.bestValue,
    pawnTaken,
    pieceCaptured,
  };
}

function isKing(game: Chess, move: string) {
  return game.get(move.slice(0, 2) as Square)?.type === "k";
}

/** Cheap prerequisites; rule out special labels before searching captures. */
function canBeBrilliant(
  game: Chess,
  playedMove: Evaluation,
  secondBestMove: Evaluation,
) {
  return (
    ((playedMove.scoreType !== "mate" &&
      calculateWinChance(playedMove.score) > 30) ||
      (playedMove.scoreType === "mate" && playedMove.score > 0)) &&
    ((secondBestMove.scoreType !== "mate" &&
      calculateWinChance(secondBestMove.score) <= 85) ||
      (secondBestMove.scoreType === "mate" && secondBestMove.score < 0)) &&
    (!isKing(game, playedMove.move) || !game.isCheck())
  );
}

function canBeGreatFind(playedMove: Evaluation, secondBestMove: Evaluation) {
  if (playedMove.scoreType !== "mate") {
    if (secondBestMove.scoreType === "mate") return true;
    return (
      (calculateWinChance(playedMove.score) > 70 &&
        calculateWinChance(secondBestMove.score) <= 70) ||
      (calculateWinChance(playedMove.score) > 30 &&
        calculateWinChance(secondBestMove.score) <= 30)
    );
  }
  return (
    playedMove.score > 0 &&
    (secondBestMove.scoreType !== "mate" || secondBestMove.score <= 0)
  );
}

export function classifyMoves(
  position: Chess,
  prevGame: PreviousPosition | null,
  moveEvaluations: PositionAnalysis,
): Classification | null {
  const game = new Chess(position.fen());
  const { bestMoves: candidates, playedMove } = moveEvaluations;
  const bestMoves = candidates.filter((move) => move.move !== null);

  if (bestMoves.length === 0) return null;

  const moveObj = lanToMove(game, playedMove.move);

  game.move(moveObj);
  if (findOpening(game.fen())) {
    return "book";
  }
  game.undo();

  if (bestMoves.length === 1) return "forced";

  const accuracy = calculateAccuracy(bestMoves[0], playedMove);

  let classification: Classification = "best";
  if (bestMoves[0].move === playedMove.move) {
    const brilliantCandidate = canBeBrilliant(game, playedMove, bestMoves[1]);
    const greatCandidate = canBeGreatFind(playedMove, bestMoves[1]);
    if (!brilliantCandidate && !greatCandidate) return "best";

    const captureTree = getCaptureTree(game, moveObj);
    const { sacrifice, pawnTaken, pieceCaptured } = isSacrifice(
      game,
      playedMove.move,
      captureTree,
    );
    if (brilliantCandidate && sacrifice > 0 && !pawnTaken)
      classification = "brilliant";
    // Preserve Great Find's precedence over Brilliant and its trade exclusion.
    if (greatCandidate && !(sacrifice <= 0 && pieceCaptured))
      classification = "greatFind";
    return classification;
  }

  if (accuracy <= 65) {
    if (
      ["mistake", "blunder", "miss"].includes(
        prevGame?.playedMove?.move.classification ?? "",
      )
    )
      return "miss";
    if (accuracy <= 20) return "blunder";
    if (
      playedMove.scoreType !== "mate" &&
      Math.max(
        0,
        calculateWinChance(bestMoves[0].score) -
          calculateWinChance(playedMove.score),
      ) > 7
    )
      return "mistake";
  }

  if (accuracy > 65) {
    if (
      (playedMove.scoreType !== "mate" &&
        Math.max(
          0,
          calculateWinChance(bestMoves[0].score) -
            calculateWinChance(playedMove.score),
        ) <= 10) ||
      (bestMoves[0].scoreType === "mate" && playedMove.scoreType === "mate")
    ) {
      if (accuracy > 90) return "excellent";
      return "good";
    }
  }
  return "inaccuracy";
}

/** Browser-independent entry point for reference-data comparison scripts. */
export function classifyPosition(
  input: PositionAnalysis & {
    fen: string;
    previousClassification?: Classification | null;
  },
): Classification | null {
  return classifyMoves(
    new Chess(input.fen),
    input.previousClassification
      ? {
          playedMove: {
            move: { classification: input.previousClassification },
          },
        }
      : null,
    input,
  );
}
