import type { Evaluation } from "@chelysis/chess";
export const ENGINE_NAME = "Stockfish 19 · Full";
export const ENGINE_PATH = "/stockfish/stockfish-19.js";
export interface SearchRequest {
  startingFen: string;
  moves: string[];
  searchMove?: string;
  depth?: number;
  multiPv?: number;
  signal: AbortSignal;
}
interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: string): void;
  terminate(): void;
}
interface ActiveSearch {
  lines: Evaluation[];
  resolve(lines: Evaluation[]): void;
  reject(error: Error): void;
}
const abortError = () => new DOMException("Analysis cancelled", "AbortError");
export function parseEvaluation(
  line: string,
): { rank: number; evaluation: Evaluation } | null {
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const move = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (!score || !move || /\b(?:lowerbound|upperbound)\b/.test(line))
    return null;
  return {
    rank: Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1),
    evaluation: {
      move: move[1],
      scoreType: score[1] as "cp" | "mate",
      score: Number(score[2]) / (score[1] === "cp" ? 100 : 1),
      depth: Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0),
    },
  };
}
/** Owns the UCI stream. Only one search may own its messages at a time. */
export class StockfishEngine {
  private worker: WorkerLike | null = null;
  private ready: Promise<void> | null = null;
  private rejectReady: ((reason: Error) => void) | null = null;
  private active: ActiveSearch | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Evaluation[]>();
  constructor(
    private factory: () => WorkerLike = () => new Worker(ENGINE_PATH),
  ) {}

  initialize(): Promise<void> {
    if (this.ready) return this.ready;
    const worker = this.factory();
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      const timer = setTimeout(
        () =>
          this.dispose(
            new Error("Stockfish took too long to load. Reload and try again."),
          ),
        60000,
      );
      worker.onerror = () => {
        clearTimeout(timer);
        this.dispose(
          new Error("Stockfish could not load. Reload and try again."),
        );
      };
      worker.onmessage = ({ data }) => {
        for (const line of String(data).split(/\r?\n/)) {
          if (line === "uciok") {
            const threads =
              typeof navigator === "undefined"
                ? 2
                : Math.max(
                    1,
                    Math.min(4, (navigator.hardwareConcurrency || 2) - 1),
                  );
            worker.postMessage(`setoption name Threads value ${threads}`);
            worker.postMessage("setoption name Hash value 32");
            worker.postMessage("ucinewgame");
            worker.postMessage("isready");
          } else if (line === "readyok") {
            clearTimeout(timer);
            this.rejectReady = null;
            resolve();
          } else if (this.active) {
            const parsed = parseEvaluation(line);
            if (parsed) {
              this.active.lines[parsed.rank - 1] = parsed.evaluation;
            }
            if (line.startsWith("bestmove")) {
              const search = this.active;
              this.active = null;
              search.resolve(search.lines.filter(Boolean));
            }
          }
        }
      };
      // Also clear the initialization timeout on disposal.
      this.rejectReady = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      worker.postMessage("uci");
    });
    return this.ready;
  }

  analyze(request: SearchRequest): Promise<Evaluation[]> {
    const run = async () => {
      const {
        signal,
        searchMove,
        startingFen,
        moves,
        depth = 12,
        multiPv = 5,
      } = request;
      if (signal.aborted) throw abortError();
      const key = JSON.stringify([
        startingFen,
        moves,
        searchMove,
        depth,
        multiPv,
      ]);
      const cached = this.cache.get(key);
      if (cached) {
        return cached.map((line) => ({ ...line }));
      }
      await this.initialize();
      if (signal.aborted) throw abortError();
      const result = await new Promise<Evaluation[]>((resolve, reject) => {
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        const searchTimer = setTimeout(
          () =>
            this.dispose(
              new Error(
                "The engine stopped responding. Try enabling it again.",
              ),
            ),
          120000,
        );
        const cancel = () => {
          this.worker?.postMessage("stop");
          stopTimer = setTimeout(() => this.dispose(abortError()), 3000);
        };
        const finish = (error: Error | null, lines: Evaluation[] = []) => {
          clearTimeout(searchTimer);
          clearTimeout(stopTimer);
          signal.removeEventListener("abort", cancel);
          if (signal.aborted) reject(abortError());
          else if (error) reject(error);
          else resolve(lines);
        };
        this.active = {
          lines: [],
          resolve: (lines) => finish(null, lines),
          reject: (error) => finish(error),
        };
        signal.addEventListener("abort", cancel, { once: true });
        this.worker!.postMessage(
          `setoption name MultiPV value ${searchMove ? 1 : multiPv}`,
        );
        this.worker!.postMessage(
          `position fen ${startingFen}${moves.length ? ` moves ${moves.join(" ")}` : ""}`,
        );
        this.worker!.postMessage(
          `go depth ${depth}${searchMove ? ` searchmoves ${searchMove}` : ""}`,
        );
      });
      this.cache.set(key, result);
      if (this.cache.size > 256)
        this.cache.delete(this.cache.keys().next().value!);
      return result.map((line) => ({ ...line }));
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  dispose(error: Error = abortError()) {
    this.rejectReady?.(error);
    this.rejectReady = null;
    this.active?.reject(error);
    this.active = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
