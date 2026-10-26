import type { Classification } from "@chelysis/chess";
export const classificationDisplay: Record<
  Classification,
  { label: string; color: string }
> = {
  brilliant: { label: "Brilliant", color: "var(--classification-brilliant)" },
  greatFind: { label: "Great find", color: "var(--classification-greatFind)" },
  best: { label: "Best", color: "var(--classification-best)" },
  excellent: { label: "Excellent", color: "var(--classification-excellent)" },
  good: { label: "Good", color: "var(--classification-good)" },
  book: { label: "Book", color: "var(--classification-book)" },
  inaccuracy: {
    label: "Inaccuracy",
    color: "var(--classification-inaccuracy)",
  },
  mistake: { label: "Mistake", color: "var(--classification-mistake)" },
  miss: { label: "Miss", color: "var(--classification-miss)" },
  blunder: { label: "Blunder", color: "var(--classification-blunder)" },
  forced: { label: "Forced", color: "var(--classification-forced)" },
};
