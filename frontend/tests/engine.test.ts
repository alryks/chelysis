import { expect, test } from "bun:test";
import { StockfishEngine, parseEvaluation } from "../src/lib/engine/stockfish";
class FakeWorker {
  commands: string[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  postMessage(message: string) {
    this.commands.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("parser handles single-PV, mates and bound scores", () => {
  expect(
    parseEvaluation("info depth 12 score cp 31 pv e2e4 e7e5")?.evaluation.score,
  ).toBe(0.31);
  expect(
    parseEvaluation("info depth 14 multipv 2 score mate -3 pv e7e8q")
      ?.evaluation.scoreType,
  ).toBe("mate");
  expect(
    parseEvaluation("info depth 12 score cp 31 lowerbound pv e2e4"),
  ).toBeNull();
});
test("UCI handshake, cancellation drain, history and caching", async () => {
  const worker = new FakeWorker();
  const engine = new StockfishEngine(() => worker);
  const ready = engine.initialize();
  expect(engine.initialize()).toBe(ready);
  expect(worker.commands).toEqual(["uci"]);
  worker.emit("uciok");
  expect(worker.commands.at(-1)).toBe("isready");
  expect(
    worker.commands.some((command) =>
      /^setoption name Threads value [1-4]$/.test(command),
    ),
  ).toBe(true);
  worker.emit("readyok");
  await ready;
  const controller = new AbortController();
  const first = engine
    .analyze({
      startingFen: "first",
      moves: [],
      signal: controller.signal,
    })
    .catch((error) => error);
  await tick();
  controller.abort();
  expect(worker.commands.at(-1)).toBe("stop");
  const request = {
    startingFen: "start",
    moves: ["e2e4"],
    searchMove: "e7e5",
    signal: new AbortController().signal,
  };
  const second = engine.analyze(request);
  await tick();
  expect(worker.commands).not.toContain("position fen start moves e2e4");
  worker.emit("info depth 12 multipv 1 score cp 999 pv d2d4");
  worker.emit("bestmove d2d4");
  expect((await first).name).toBe("AbortError");
  await tick();
  expect(worker.commands.at(-2)).toBe("position fen start moves e2e4");
  expect(worker.commands.at(-1)).toBe("go depth 12 searchmoves e7e5");
  worker.emit("info depth 12 multipv 1 score cp 31 pv e7e5");
  worker.emit("bestmove e7e5");
  expect((await second)[0].score).toBe(0.31);
  const count = worker.commands.length;
  expect((await engine.analyze(request))[0].move).toBe("e7e5");
  expect(worker.commands).toHaveLength(count);
  engine.dispose();
});
test("worker errors reject active jobs and allow recovery", async () => {
  let worker = new FakeWorker();
  const engine = new StockfishEngine(() => worker);
  const ready = engine.initialize();
  worker.emit("uciok");
  worker.emit("readyok");
  await ready;
  const search = engine
    .analyze({
      startingFen: "start",
      moves: [],
      signal: new AbortController().signal,
    })
    .catch((error) => error);
  await tick();
  worker.onerror?.({} as ErrorEvent);
  expect((await search).message).toContain("could not load");
  expect(worker.terminated).toBe(true);
  worker = new FakeWorker();
  const retry = engine.initialize();
  worker.emit("uciok");
  worker.emit("readyok");
  await retry;
  engine.dispose();
});
