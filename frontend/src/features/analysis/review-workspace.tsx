"use client";
import Image from "next/image";
import { Button } from "@/components/button";
import {
  IconRefresh,
  IconChevronsLeft,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
  IconPower,
} from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  accuracyByColor,
  classifications,
  findOpening,
  gameAt,
  importPgn,
} from "@chelysis/chess";
import type { Square } from "chess.js";
import { useReview } from "./use-review";
import { classificationDisplay } from "./classifications";
import { EvaluationBar } from "./evaluation-bar";
const Board = dynamic(() => import("./board"), {
  ssr: false,
  loading: () => <div className="board-placeholder">Preparing board…</div>,
});
const sample = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *";

export default function ReviewWorkspace() {
  const { state, dispatch, error, setError, displayEvaluation } = useReview();
  const [pgn, setPgn] = useState("");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [arrowCount, setArrowCount] = useState(2);
  const { line, cursor, reviewing, enabled } = state;
  const game = gameAt(line, cursor);
  const previous = line.positions[cursor - 1];
  const accuracy = accuracyByColor(line);
  const completed = line.positions.filter(
    (position) => position.playedMove,
  ).length;
  const total = line.positions.length - 1;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const opening = line.positions
    .slice(0, cursor + 1)
    .map((position) => findOpening(position.fen))
    .filter(Boolean)
    .at(-1)?.name;
  const selectedMove = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const button = selectedMove.current;
    const list = button?.closest(".move-list");
    if (!button || !list) return;
    const item = button.getBoundingClientRect(),
      viewport = list.getBoundingClientRect();
    if (item.bottom > viewport.bottom)
      list.scrollTop += item.bottom - viewport.bottom;
    else if (item.top < viewport.top) list.scrollTop -= viewport.top - item.top;
  }, [cursor]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest(
          'textarea, input, select, [contenteditable="true"]',
        ) ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey)
      )
        return;
      const positions: Record<string, number> = {
        ArrowLeft: cursor - 1,
        ArrowRight: cursor + 1,
        ArrowUp: 0,
        ArrowDown: line.positions.length - 1,
      };
      if (event.key in positions && !reviewing) {
        event.preventDefault();
        dispatch({ type: "navigate", cursor: positions[event.key] });
      }
      if (event.key.toLowerCase() === "x")
        setOrientation((value) => (value === "white" ? "black" : "white"));
      if (event.key.toLowerCase() === "s" && !reviewing)
        dispatch({ type: "toggle-engine" });
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [cursor, line.positions.length, reviewing, dispatch]);
  function analyze(text = pgn) {
    try {
      if (!text.trim())
        throw new Error("Paste a PGN game to start the analysis.");
      const imported = importPgn(text);
      if (imported.positions.length === 1)
        throw new Error("The PGN contains no moves.");
      setError(null);
      dispatch({ type: "import", line: imported });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not read this PGN.",
      );
    }
  }
  function onMove(from: Square, to: Square, promotion?: string) {
    try {
      const validation = gameAt(line, cursor);
      validation.move({ from, to, promotion });
      dispatch({ type: "play", from, to, promotion });
      return true;
    } catch {
      return false;
    }
  }
  const counts = Object.fromEntries(
    classifications.map((key) => [key, { w: 0, b: 0 }]),
  );
  for (const position of line.positions) {
    const category = position.playedMove?.classification;
    if (category)
      counts[category][position.fen.split(" ")[1] === "w" ? "w" : "b"]++;
  }
  return (
    <main className="workspace">
      <header className="app-header">
        <Image
          unoptimized
          className="brand"
          loading="eager"
          src="/brand/logo.svg"
          alt="Chelysis"
          width={180}
          height={40}
        />
      </header>
      <div className="workspace-grid">
        <section
          className="board-section"
          aria-label="Chessboard and navigation"
        >
          <div className="board-and-eval">
            <div className="board-container">
              <Board
                line={line}
                cursor={cursor}
                orientation={orientation}
                disabled={reviewing}
                engineEnabled={enabled}
                arrowCount={arrowCount}
                onMove={onMove}
              />
            </div>
            <EvaluationBar
              evaluation={displayEvaluation?.evaluation}
              turn={displayEvaluation?.turn ?? game.turn()}
              orientation={orientation}
            />
          </div>
        </section>
        <aside className="analysis-panel" aria-label="Game analysis">
          <div className="analysis-content">
            <section className="import-section">
              <div className="section-heading">
                <h1>Game analysis</h1>
              </div>
              <div className="field-label">
                <label htmlFor="pgn">Paste your game in PGN format</label>{" "}
                <span>or</span>{" "}
                <Button
                  variant="text"
                  disabled={reviewing}
                  onClick={() => {
                    setPgn(sample);
                    analyze(sample);
                  }}
                >
                  try an example
                </Button>
              </div>
              <textarea
                id="pgn"
                value={pgn}
                onChange={(event) => setPgn(event.target.value)}
                spellCheck={false}
                placeholder={"1. e4 e5 2. Nf3 Nc6…"}
              />
              <div className="import-actions">
                <Button
                  variant="primary"
                  onClick={() => analyze()}
                  disabled={reviewing}
                >
                  {reviewing ? `Analyzing… ${progress}%` : "Analyze game"}
                </Button>
                {reviewing && (
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: "navigate", cursor })}
                  >
                    Stop
                  </Button>
                )}
              </div>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                  <Button
                    aria-label="Dismiss error"
                    onClick={() => setError(null)}
                  >
                    ×
                  </Button>
                </div>
              )}
            </section>
            <section className="results-section" aria-label="Analysis results">
              <div className="accuracy-heading">
                <h2>Accuracy</h2>
                {completed > 0 && completed < total && (
                  <span>
                    {completed} / {total} analyzed
                  </span>
                )}
              </div>
              <div className="accuracy-scores">
                <div aria-label="White accuracy">
                  <strong>
                    {completed ? `${accuracy.white.toFixed(1)}%` : "—"}
                  </strong>
                </div>
                <div aria-label="Black accuracy">
                  <strong>
                    {completed ? `${accuracy.black.toFixed(1)}%` : "—"}
                  </strong>
                </div>
              </div>
              <div className="opening">
                <span>Opening</span>
                <strong>{opening ?? "Start position"}</strong>
              </div>
              <details className="classification-summary" open={completed > 0}>
                <summary>Move classifications</summary>
                <div className="classification-table">
                  {classifications.map((category) => (
                    <div
                      key={category}
                      style={{ color: classificationDisplay[category].color }}
                    >
                      <span>{counts[category].w}</span>
                      <span className="classification-name">
                        <Image
                          unoptimized
                          src={`/classification/${category}.svg`}
                          alt=""
                          width={18}
                          height={18}
                        />
                        {classificationDisplay[category].label}
                      </span>
                      <span>{counts[category].b}</span>
                    </div>
                  ))}
                </div>
              </details>
            </section>
            <section className="moves-section">
              <div className="section-heading">
                <h2>Moves</h2>
                {previous?.playedMove?.classification && (
                  <span
                    className="current-classification"
                    data-testid="current-classification"
                    style={{
                      color:
                        classificationDisplay[
                          previous.playedMove.classification
                        ].color,
                    }}
                  >
                    {
                      classificationDisplay[previous.playedMove.classification]
                        .label
                    }
                  </span>
                )}
              </div>
              <div className="move-list" aria-label="Game moves">
                {total === 0 ? (
                  <p className="empty-moves">
                    Import a game or play a move on the board.
                  </p>
                ) : (
                  line.positions.slice(0, -1).map((position, index) => (
                    <div
                      className="move-entry"
                      key={`${index}-${position.move}`}
                    >
                      <span className="ply-number">
                        {position.fen.split(" ")[1] === "w"
                          ? `${position.fen.split(" ")[5]}.`
                          : `${position.fen.split(" ")[5]}…`}
                      </span>
                      <Button
                        ref={cursor === index + 1 ? selectedMove : undefined}
                        selected={cursor === index + 1}
                        aria-current={cursor === index + 1 ? "step" : undefined}
                        disabled={reviewing}
                        aria-label={`Go to ${position.san}, ply ${index + 1}`}
                        onClick={() =>
                          dispatch({ type: "navigate", cursor: index + 1 })
                        }
                      >
                        {position.san}
                        {position.playedMove?.classification && (
                          <Image
                            unoptimized
                            src={`/classification/${position.playedMove.classification}.svg`}
                            alt={
                              classificationDisplay[
                                position.playedMove.classification
                              ].label
                            }
                            width={17}
                            height={17}
                          />
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
          <div className="panel-controls">
            <nav className="board-controls" aria-label="Game navigation">
              <Button
                size="icon"
                title="Flip board (X)"
                aria-pressed={orientation === "black"}
                aria-label="Flip board"
                onClick={() =>
                  setOrientation((value) =>
                    value === "white" ? "black" : "white",
                  )
                }
              >
                <IconRefresh size={22} aria-hidden="true" />
              </Button>
              <div className="navigation-buttons">
                <Button
                  size="icon"
                  aria-label="First move"
                  disabled={reviewing || cursor === 0}
                  onClick={() => dispatch({ type: "navigate", cursor: 0 })}
                >
                  <IconChevronsLeft size={22} aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  aria-label="Previous move"
                  disabled={reviewing || cursor === 0}
                  onClick={() =>
                    dispatch({ type: "navigate", cursor: cursor - 1 })
                  }
                >
                  <IconChevronLeft size={22} aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  aria-label="Next move"
                  disabled={reviewing || cursor === total}
                  onClick={() =>
                    dispatch({ type: "navigate", cursor: cursor + 1 })
                  }
                >
                  <IconChevronRight size={22} aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  aria-label="Last move"
                  disabled={reviewing || cursor === total}
                  onClick={() => dispatch({ type: "navigate", cursor: total })}
                >
                  <IconChevronsRight size={22} aria-hidden="true" />
                </Button>
              </div>
              <Button
                size="icon"
                aria-pressed={enabled}
                title="Toggle engine (S)"
                aria-label="Toggle engine"
                onClick={() => dispatch({ type: "toggle-engine" })}
              >
                <IconPower size={22} aria-hidden="true" />
              </Button>
            </nav>
            <div className="board-settings">
              <label htmlFor="arrows">
                Suggested moves <output>{arrowCount}</output>
              </label>
              <input
                id="arrows"
                type="range"
                min="0"
                max="5"
                value={arrowCount}
                onChange={(event) => setArrowCount(Number(event.target.value))}
              />
            </div>
          </div>
        </aside>
      </div>
      {state.branch && (
        <div className="branch-notice">
          <span>You’re exploring an alternative line.</span>
          <Button variant="text" onClick={() => dispatch({ type: "restore" })}>
            Return to game
          </Button>
        </div>
      )}
      <footer className="app-footer">
        <p className="keyboard-hint">
          ← → Browse moves <span>↑ ↓ Start / end</span>
          <span>X Flip board</span>
          <span>S Toggle engine</span>
        </p>
        <a href="/stockfish/SOURCE.txt" target="_blank" rel="noreferrer">
          Stockfish source & license
        </a>
      </footer>
    </main>
  );
}
