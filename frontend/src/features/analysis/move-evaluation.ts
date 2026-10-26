import type { Evaluation } from "@chelysis/chess";
/** MultiPV already evaluates its candidate moves from the required position. */
export async function playedMoveEvaluation(
  candidates: Evaluation[],
  move: string,
  search: () => Promise<Evaluation[]>,
): Promise<Evaluation> {
  const candidate = candidates.find((candidate) => candidate.move === move);
  if (candidate) return candidate;
  const [evaluation] = await search();
  if (!evaluation)
    throw new Error("The engine returned no evaluation for this move.");
  return evaluation;
}
