import { expect, test } from "bun:test";
import { emptyGame, gameAt, gameStatus, importPgn, playMove } from "../src";

test("PGN import retains setup FEN and black-to-move numbering", () => {
  const line = importPgn(
    '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/KR6 b - - 0 25"]\n\n25... Kg7 *',
  );
  expect(line.startingFen).toContain("b - - 0 25");
  expect(line.positions[0].san).toBe("Kg7");
  expect(gameAt(line, 1).turn()).toBe("w");
});
test("castling and en passant are legal and update the board correctly", () => {
  const castle = importPgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *");
  expect(gameAt(castle, 7).get("f1")?.type).toBe("r");
  const ep = importPgn("1. e4 a6 2. e5 d5 3. exd6 *");
  expect(gameAt(ep, 5).get("d5")).toBeUndefined();
  expect(gameAt(ep, 5).get("d6")?.type).toBe("p");
});
test("all promotion choices work, including underpromotion", () => {
  for (const promotion of ["q", "r", "b", "n"] as const) {
    const line = playMove(
      emptyGame("7k/P7/8/8/8/8/8/7K w - - 0 1"),
      0,
      "a7",
      "a8",
      promotion,
    );
    expect(gameAt(line, 1).get("a8")?.type).toBe(promotion);
  }
});
test("history is retained for threefold repetition", () => {
  const line = importPgn("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *");
  const game = gameAt(line, 8);
  expect(game.isThreefoldRepetition()).toBe(true);
  expect(gameStatus(game)).toBe("Draw by repetition");
});
test("alternative move invalidates played-move analysis and preserves the original line", () => {
  const line = importPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
  line.positions[4].bestMoves = [{ move: "f1b5", score: 0.2, scoreType: "cp" }];
  line.positions[4].playedMove = {
    move: "f1b5",
    score: 0.2,
    scoreType: "cp",
    classification: "book",
  };
  const branch = playMove(line, 4, "f1", "c4");
  expect(branch.positions).toHaveLength(6);
  expect(branch.positions[4].move).toBe("f1c4");
  expect(branch.positions[4].playedMove).toBeUndefined();
  expect(branch.positions[4].bestMoves).toEqual(line.positions[4].bestMoves);
  expect(line.positions[4].move).toBe("f1b5");
});
test("illegal moves are rejected; checkmate and stalemate detected", () => {
  expect(() => playMove(emptyGame(), 0, "e2", "e5")).toThrow();
  const mate = importPgn("1. f3 e5 2. g4 Qh4# 0-1");
  expect(gameStatus(gameAt(mate, 4))).toContain("Checkmate");
  expect(
    gameStatus(gameAt(emptyGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), 0)),
  ).toContain("stalemate");
});
