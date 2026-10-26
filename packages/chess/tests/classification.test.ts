import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import { readFileSync } from "node:fs";
import openings from "../src/data/openings.json";
import {
  calculateAccuracy,
  classifyMoves,
  classifyPosition,
  type Evaluation,
  type Classification,
  type PositionAnalysis,
  type PreviousPosition,
} from "../src";
// Frozen pre-migration implementation. Only used as a behavioral oracle in tests.
const legacy = new Function(
  "Chess",
  "openings",
  `${readFileSync(new URL("./fixtures/legacy-classification.txt", import.meta.url), "utf8")}; return { classifyMoves, calculateAccuracy };`,
)(Chess, openings) as {
  classifyMoves: typeof classifyMoves;
  calculateAccuracy: typeof calculateAccuracy;
};
const evaluation = (
  move: string,
  score: number,
  scoreType: "cp" | "mate" = "cp",
): Evaluation => ({ move, score, scoreType });

describe("classification rule preservation", () => {
  test("accuracy matches the original for centipawn and mate scores", () => {
    for (const typeA of ["cp", "mate"] as const)
      for (const typeB of ["cp", "mate"] as const) {
        for (const a of [-10, -3, -1, 0, 1, 3, 10])
          for (const b of [-10, -3, -1, 0, 1, 3, 10]) {
            const best = evaluation("e2e4", a, typeA),
              played = evaluation("d2d4", b, typeB);
            expect(calculateAccuracy(best, played)).toBe(
              legacy.calculateAccuracy(best, played),
            );
          }
      }
  });
  test("opening, forced, sacrifice, great-find and loss thresholds match the original", () => {
    const positions = [new Chess(), new Chess("7k/8/8/8/8/8/8/KR6 w - - 0 1")];
    const walk = new Chess();
    // Deterministic game positions, including captures and non-book positions.
    for (let i = 0; i < 18; i++) {
      const moves = walk.moves();
      if (!moves.length) break;
      walk.move(moves[(i * 13 + 7) % moves.length]);
      if (i % 3 === 0) positions.push(new Chess(walk.fen()));
    }
    let checked = 0;
    for (const board of positions) {
      const moves = board.moves({ verbose: true });
      for (const played of moves.slice(0, 4))
        for (const [bestScore, playedScore] of [
          [0, 0],
          [1, 0.8],
          [3, 0],
          [8, -8],
          [0, -3],
          [2, 1],
          [-2, -4],
          [1, -1],
          [2, -2],
        ]) {
          for (const previousClassification of [null, "blunder"] as const) {
            const previous: PreviousPosition | null = previousClassification
              ? {
                  playedMove: {
                    move: { classification: previousClassification },
                  },
                }
              : null;
            const input = {
              bestMoves: [
                evaluation(moves[0].lan, bestScore),
                evaluation(moves[1]?.lan ?? moves[0].lan, -2),
              ],
              playedMove: evaluation(played.lan, playedScore),
            };
            expect(classifyMoves(board, previous, input)).toBe(
              legacy.classifyMoves(new Chess(board.fen()), previous, input),
            );
            checked++;
          }
        }
      if (moves.length) {
        const input = {
          bestMoves: [evaluation(moves[0].lan, 2)],
          playedMove: evaluation(moves[0].lan, 2),
        };
        expect(classifyMoves(board, null, input)).toBe(
          legacy.classifyMoves(new Chess(board.fen()), null, input),
        );
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 30000);
  test("public entry point is reusable without React and does not mutate callers", () => {
    const board = new Chess();
    expect(
      classifyPosition({
        fen: board.fen(),
        bestMoves: [evaluation("e2e4", 0.3), evaluation("d2d4", 0.2)],
        playedMove: evaluation("e2e4", 0.3),
      }),
    ).toBe("book");
    classifyMoves(board, null, {
      bestMoves: [evaluation("e2e4", 0.3)],
      playedMove: evaluation("e2e4", 0.3),
    });
    expect(board.fen()).toBe(new Chess().fen());
  });
});

test("all eleven classifications retain their original rules", () => {
  const quiet = "7k/8/8/8/8/8/8/KR6 w - - 0 1";
  const sacrifice = "6k1/5ppp/8/8/8/2B5/8/6K1 w - - 0 1";
  const cases: (PositionAnalysis & {
    expected: Classification;
    fen: string;
    previousClassification?: Classification;
  })[] = [
    {
      expected: "book",
      fen: new Chess().fen(),
      bestMoves: [evaluation("e2e4", 0.3), evaluation("d2d4", 0.2)],
      playedMove: evaluation("e2e4", 0.3),
    },
    {
      expected: "forced",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0)],
      playedMove: evaluation("a1a2", 0),
    },
    {
      expected: "best",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", 0)],
      playedMove: evaluation("a1a2", 0),
    },
    {
      expected: "excellent",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -0.1)],
      playedMove: evaluation("b1b2", -0.05),
    },
    {
      expected: "good",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -0.3)],
      playedMove: evaluation("b1b2", -0.3),
    },
    {
      expected: "inaccuracy",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -0.5)],
      playedMove: evaluation("b1b2", -0.5),
    },
    {
      expected: "mistake",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -1)],
      playedMove: evaluation("b1b2", -1),
    },
    {
      expected: "blunder",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -2)],
      playedMove: evaluation("b1b2", -2),
    },
    {
      expected: "miss",
      fen: quiet,
      bestMoves: [evaluation("a1a2", 0), evaluation("b1b2", -1)],
      playedMove: evaluation("b1b2", -1),
      previousClassification: "blunder" as const,
    },
    {
      expected: "brilliant",
      fen: sacrifice,
      bestMoves: [evaluation("c3g7", 2), evaluation("c3d4", 0)],
      playedMove: evaluation("c3g7", 2),
    },
    {
      expected: "greatFind",
      fen: sacrifice,
      bestMoves: [evaluation("c3g7", 3), evaluation("c3d4", -3)],
      playedMove: evaluation("c3g7", 3),
    },
  ];
  for (const input of cases) {
    const previous = input.previousClassification
      ? {
          playedMove: {
            move: { classification: input.previousClassification },
          },
        }
      : null;
    expect(legacy.classifyMoves(new Chess(input.fen), previous, input)).toBe(
      input.expected,
    );
    expect(classifyPosition(input)).toBe(input.expected);
  }
});
