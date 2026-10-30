import { classifyPosition } from "@chelysis/chess";
import type { ClassificationRequest, ClassificationResponse } from "./protocol";

self.onmessage = ({ data }: MessageEvent<ClassificationRequest>) => {
  let response: ClassificationResponse;
  try {
    response = { id: data.id, classification: classifyPosition(data.input) };
  } catch (error) {
    response = {
      id: data.id,
      error:
        error instanceof Error ? error.message : "Move classification failed.",
    };
  }
  self.postMessage(response);
};
