import type { Classification, classifyPosition } from "@chelysis/chess";

export interface ClassificationRequest {
  id: number;
  input: Parameters<typeof classifyPosition>[0];
}
export type ClassificationResponse =
  | { id: number; classification: Classification | null }
  | { id: number; error: string };
