import { expect, test } from "bun:test";
import { ClassificationClient } from "../src/lib/classification/client";
import type {
  ClassificationRequest,
  ClassificationResponse,
} from "../src/lib/classification/protocol";

class FakeWorker {
  onmessage: ((event: MessageEvent<ClassificationResponse>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: ClassificationRequest[] = [];
  terminated = false;
  postMessage(message: ClassificationRequest) {
    this.requests.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: ClassificationResponse) {
    this.onmessage?.({ data } as MessageEvent<ClassificationResponse>);
  }
}
const input: ClassificationRequest["input"] = {
  fen: "7k/8/8/8/8/8/8/KR6 w - - 0 1",
  bestMoves: [{ move: "a1a2", score: 0, scoreType: "cp" }],
  playedMove: { move: "a1a2", score: 0, scoreType: "cp" },
};
test("classification is asynchronous and the worker is reused after completion", async () => {
  const worker = new FakeWorker();
  let creations = 0;
  const client = new ClassificationClient(() => {
    creations++;
    return worker;
  });
  let completed = false;
  const first = client
    .classify(input, new AbortController().signal)
    .then((value) => {
      completed = true;
      return value;
    });
  await Promise.resolve();
  expect(completed).toBe(false);
  worker.emit({ id: worker.requests[0].id, classification: "forced" });
  expect(await first).toBe("forced");
  const second = client.classify(input, new AbortController().signal);
  worker.emit({ id: worker.requests[0].id, classification: "blunder" });
  worker.emit({ id: worker.requests[1].id, classification: null });
  expect(await second).toBeNull();
  expect(creations).toBe(1);
  client.dispose();
  expect(worker.terminated).toBe(true);
});
test("aborting terminates CPU work and stale results/errors cannot affect a replacement", async () => {
  const workers: FakeWorker[] = [];
  const client = new ClassificationClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const controller = new AbortController();
  const first = client.classify(input, controller.signal).catch((e) => e);
  const staleMessage = workers[0].onmessage!;
  const staleError = workers[0].onerror!;
  controller.abort();
  expect((await first).name).toBe("AbortError");
  expect(workers[0].terminated).toBe(true);
  const second = client.classify(input, new AbortController().signal);
  staleMessage({
    data: { id: workers[0].requests[0].id, classification: "blunder" },
  } as MessageEvent<ClassificationResponse>);
  staleError({} as ErrorEvent);
  expect(workers[1].terminated).toBe(false);
  workers[1].emit({ id: workers[1].requests[0].id, classification: "best" });
  expect(await second).toBe("best");
  client.dispose();
});
test("worker failures reject pending work and permit recovery; pre-aborted requests do not start workers", async () => {
  const workers: FakeWorker[] = [];
  const client = new ClassificationClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const controller = new AbortController();
  controller.abort();
  await expect(client.classify(input, controller.signal)).rejects.toMatchObject(
    { name: "AbortError" },
  );
  expect(workers).toHaveLength(0);
  const first = client
    .classify(input, new AbortController().signal)
    .catch((e) => e);
  workers[0].onerror?.({} as ErrorEvent);
  expect((await first).message).toContain("worker failed");
  const second = client
    .classify(input, new AbortController().signal)
    .catch((e) => e);
  workers[1].emit({ id: workers[1].requests[0].id, error: "Invalid position" });
  expect((await second).message).toBe("Invalid position");
  client.dispose();
});
