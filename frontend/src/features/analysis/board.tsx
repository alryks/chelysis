"use client";
import Image from "next/image";
import { Button } from "@/components/button";
import { useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import { type GameLine, gameAt } from "@chelysis/chess";
import type { Square } from "chess.js";
import { classificationDisplay } from "./classifications";

interface Props {
  line: GameLine;
  cursor: number;
  orientation: "white" | "black";
  disabled: boolean;
  engineEnabled: boolean;
  arrowCount: number;
  onMove(from: Square, to: Square, promotion?: string): boolean;
}
export default function Board({
  line,
  cursor,
  orientation,
  disabled,
  engineEnabled,
  arrowCount,
  onMove,
}: Props) {
  const game = gameAt(line, cursor);
  const position = line.positions[cursor];
  const [selection, setSelection] = useState<{
    square: Square;
    fen: string;
  } | null>(null);
  const [promotion, setPromotion] = useState<{
    from: Square;
    to: Square;
    fen: string;
  } | null>(null);
  const selected = selection?.fen === position.fen ? selection.square : null;
  const pendingPromotion = promotion?.fen === position.fen ? promotion : null;
  const styles: Record<string, CSSProperties> = {};
  const previous = line.positions[cursor - 1];
  const classification = previous?.playedMove?.classification;
  if (previous?.move) {
    const color = classification
      ? `color-mix(in srgb, ${classificationDisplay[classification].color} 72%, transparent)`
      : "var(--board-last-move)";
    styles[previous.move.slice(0, 2)] = { backgroundColor: color };
    styles[previous.move.slice(2, 4)] = { backgroundColor: color };
  }
  if (selected) {
    styles[selected] = { backgroundColor: "var(--board-selection)" };
    for (const move of game.moves({ square: selected, verbose: true }))
      styles[move.to] = {
        background: game.get(move.to)
          ? "radial-gradient(transparent 60%, var(--board-hint) 62%, var(--board-hint) 72%, transparent 74%)"
          : "radial-gradient(var(--board-hint) 20%, transparent 22%)",
      };
  }
  for (const row of game.board())
    for (const piece of row) {
      if (
        piece?.type === "k" &&
        (game.isDraw() || (piece.color === game.turn() && game.isCheck()))
      ) {
        styles[piece.square] = {
          background: `radial-gradient(${game.isDraw() ? "var(--board-draw)" : "var(--board-check)"} 25%, transparent 75%)`,
        };
      }
    }
  function attempt(from: string, to: string | null) {
    if (disabled || !to) return false;
    const move = game
      .moves({ square: from as Square, verbose: true })
      .find((move) => move.to === to);
    if (!move) return false;
    setSelection(null);
    if (move.promotion) {
      setPromotion({
        from: from as Square,
        to: to as Square,
        fen: position.fen,
      });
      return false;
    }
    return onMove(from as Square, to as Square);
  }
  const destination = previous?.move?.slice(2, 4);
  const file = destination ? destination.charCodeAt(0) - 97 : 0;
  const rank = destination ? Number(destination[1]) - 1 : 0;
  return (
    <div className="board-wrapper">
      <Chessboard
        options={{
          id: "analysis-board",
          boardStyle: { gridTemplateRows: "repeat(8, minmax(0, 1fr))" },
          squareStyle: {
            aspectRatio: "auto",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          },
          position: position.fen,
          boardOrientation: orientation,
          animationDurationInMs: 120,
          allowDragging: !disabled,
          allowAutoScroll: false,
          darkSquareStyle: { backgroundColor: "var(--board-dark)" },
          lightSquareStyle: { backgroundColor: "var(--board-light)" },
          darkSquareNotationStyle: { color: "var(--text)" },
          lightSquareNotationStyle: { color: "var(--dim)" },
          squareStyles: styles,
          canDragPiece: ({ piece }) =>
            !disabled && piece.pieceType[0] === game.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            attempt(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => {
            if (disabled) return;
            if (selected && attempt(selected, square)) return;
            if (game.get(square as Square)?.color === game.turn())
              setSelection({ square: square as Square, fen: position.fen });
            else setSelection(null);
          },
          arrows: engineEnabled
            ? (position.bestMoves ?? [])
                .slice(0, arrowCount)
                .map((move, i) => ({
                  startSquare: move.move.slice(0, 2),
                  endSquare: move.move.slice(2, 4),
                  color: `color-mix(in srgb, var(--text) ${80 - i * 13}%, transparent)`,
                }))
            : [],
        }}
      />
      {classification && destination && (
        <Image
          unoptimized
          width={28}
          height={28}
          className="board-marker"
          data-testid="classification-marker"
          src={`/classification/${classification}.svg`}
          alt={classificationDisplay[classification].label}
          style={{
            left: `${(orientation === "white" ? file + 1 : 8 - file) * 12.5}%`,
            top: `${(orientation === "white" ? 7 - rank : rank) * 12.5}%`,
          }}
        />
      )}
      {pendingPromotion && (
        <div className="promotion-backdrop">
          <div
            className="promotion-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Choose promotion piece"
          >
            <h2>Promote pawn</h2>
            <div className="promotion-options">
              {(["q", "r", "b", "n"] as const).map((piece, index) => (
                <Button
                  key={piece}
                  onClick={() => {
                    onMove(pendingPromotion.from, pendingPromotion.to, piece);
                    setPromotion(null);
                  }}
                  aria-label={`Promote to ${["queen", "rook", "bishop", "knight"][index]}`}
                >
                  {
                    (game.turn() === "w"
                      ? ["♕", "♖", "♗", "♘"]
                      : ["♛", "♜", "♝", "♞"])[index]
                  }
                </Button>
              ))}
            </div>
            <Button variant="text" onClick={() => setPromotion(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
