import type { Classification } from "@chelysis/chess";
import type { ClassificationRequest, ClassificationResponse } from "./protocol";

interface WorkerLike {
  onmessage: ((event: MessageEvent<ClassificationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ClassificationRequest): void;
  terminate(): void;
}
const abortError = () =>
  new DOMException("Classification cancelled", "AbortError");

/** Keep a worker warm between moves; terminate cancelled CPU work immediately. */
export class ClassificationClient {
  private worker: WorkerLike | null = null;
  private rejectActive: ((error: Error) => void) | null = null;
  private sequence = 0;

  constructor(
    private factory: () => WorkerLike = () =>
      new Worker(new URL("./classification.worker.ts", import.meta.url)),
  ) {}

  classify(
    input: ClassificationRequest["input"],
    signal: AbortSignal,
  ): Promise<Classification | null> {
    if (signal.aborted) return Promise.reject(abortError());
    if (this.rejectActive) this.dispose();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const finish = (
        error?: Error,
        classification: Classification | null = null,
      ) => {
        signal.removeEventListener("abort", cancel);
        this.rejectActive = null;
        if (error) reject(error);
        else resolve(classification);
      };
      const cancel = () => this.dispose();
      this.rejectActive = (error) => finish(error);
      signal.addEventListener("abort", cancel, { once: true });
      try {
        this.worker ??= this.factory();
        this.worker.onmessage = ({ data }) => {
          if (data.id !== id || id !== this.sequence || !this.rejectActive)
            return;
          if ("error" in data) finish(new Error(data.error));
          else finish(undefined, data.classification);
        };
        this.worker.onerror = () => {
          if (id === this.sequence && this.worker)
            this.dispose(
              new Error("The classification worker failed. Try again."),
            );
        };
        this.worker.postMessage({ id, input });
      } catch (error) {
        this.dispose(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(error: Error = abortError()) {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.rejectActive?.(error);
    this.rejectActive = null;
  }
}
