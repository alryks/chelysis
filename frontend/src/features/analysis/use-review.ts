"use client";
import { useEffect, useReducer, useState } from "react";
import { classifyPosition, gameAt, type Evaluation } from "@chelysis/chess";
import { StockfishEngine } from "@/lib/engine/stockfish";
import { initialReview, reviewReducer } from "./state";
import { displayedEvaluation } from "./displayed-evaluation";
import { playedMoveEvaluation } from "./move-evaluation";

export function useReview() {
  const [state, dispatch] = useReducer(reviewReducer, initialReview);
  const [engine] = useState(() => new StockfishEngine());
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    engine
      .initialize()
      .then(() => {
        if (mounted) setEngineReady(true);
      })
      .catch((error) => {
        if (mounted && error.name !== "AbortError") setError(error.message);
      });
    return () => {
      mounted = false;
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    if (!state.enabled) return;
    const controller = new AbortController();
    const { line, cursor, revision } = state;
    const { signal } = controller;
    // Review computes the next move before displaying it. Interactive branches
    // already display the played move, so classify the preceding position there.
    const moveIndex = state.reviewing ? cursor : cursor - 1;
    const position = line.positions[moveIndex];
    const current = line.positions[cursor];
    const search = (index: number, searchMove?: string) =>
      engine.analyze({
        startingFen: line.startingFen,
        moves: line.positions.slice(0, index).map((p) => p.move!),
        searchMove,
        signal,
      });
    async function update() {
      await engine.initialize();
      if (signal.aborted) return;
      setEngineReady(true);
      if (position?.move && !position.bestMoves) {
        const moves = await search(moveIndex);
        if (!signal.aborted)
          dispatch({ type: "best", revision, index: moveIndex, moves });
      } else if (position?.move && !position.playedMove) {
        const evaluation = await playedMoveEvaluation(
          position.bestMoves!,
          position.move,
          () => search(moveIndex, position.move),
        );
        if (signal.aborted) return;
        const classification = classifyPosition({
          fen: position.fen,
          bestMoves: position.bestMoves!,
          playedMove: evaluation,
          previousClassification:
            line.positions[moveIndex - 1]?.playedMove?.classification,
        });
        // These candidates will be needed for the next classification anyway.
        // Publish them with the move so arrows do not arrive a search later.
        // Leave the final position independent of game-review completion.
        const nextIndex = moveIndex + 1;
        let nextMoves: Evaluation[] | undefined;
        if (
          state.reviewing &&
          nextIndex < line.positions.length - 1 &&
          !line.positions[nextIndex].bestMoves
        ) {
          nextMoves = gameAt(line, nextIndex).isGameOver()
            ? []
            : await search(nextIndex);
          if (signal.aborted) return;
        }
        dispatch({
          type: "classified",
          revision,
          index: moveIndex,
          evaluation,
          classification,
          nextMoves,
        });
      } else if (state.reviewing) {
        // Advance cached classifications without waiting for position suggestions.
        dispatch({ type: "advance" });
      } else if (!current.bestMoves) {
        const moves = gameAt(line, cursor).isGameOver()
          ? []
          : await search(cursor);
        if (!signal.aborted)
          dispatch({ type: "best", revision, index: cursor, moves });
      }
    }
    update().catch((error) => {
      if (!signal.aborted && error.name !== "AbortError") {
        setError(error.message);
        dispatch({ type: "stop" });
      }
    });
    return () => controller.abort();
  }, [state, engine]);
  return {
    state,
    dispatch,
    engineReady,
    error,
    setError,
    displayEvaluation: displayedEvaluation(state),
  };
}
