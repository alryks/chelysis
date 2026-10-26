import { useId, useState, type MouseEvent } from "react";
import { calculateWinChance, type Evaluation } from "@chelysis/chess";
export function EvaluationBar({
  evaluation,
  turn,
  orientation,
}: {
  evaluation?: Evaluation;
  turn: "w" | "b";
  orientation: "white" | "black";
}) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const score = (evaluation?.score ?? 0) * (turn === "w" ? 1 : -1);
  const white =
    evaluation?.scoreType === "mate"
      ? score > 0
        ? 100
        : 0
      : calculateWinChance(score);
  const label = !evaluation
    ? "—"
    : evaluation.scoreType === "mate"
      ? `${score < 0 ? "−" : ""}M${Math.abs(score)}`
      : `${score > 0 ? "+" : ""}${score.toFixed(1)}`;
  function showTooltip(event: MouseEvent<HTMLDivElement>) {
    setTooltip({
      x: Math.min(event.clientX + 12, window.innerWidth - 80),
      y: Math.max(8, Math.min(event.clientY - 36, window.innerHeight - 40)),
    });
  }
  return (
    <div
      className="evaluation"
      role="meter"
      tabIndex={0}
      aria-label={`Position evaluation: ${label}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={white}
      aria-valuetext={label}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseMove={showTooltip}
      onMouseLeave={() => setTooltip(null)}
      onFocus={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTooltip({
          x: Math.min(rect.right + 8, window.innerWidth - 80),
          y: Math.max(8, rect.top + rect.height / 2 - 16),
        });
      }}
      onBlur={() => setTooltip(null)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTooltip(null);
      }}
    >
      <div
        className="evaluation-white"
        style={{
          height: `${white}%`,
          [orientation === "white" ? "bottom" : "top"]: 0,
        }}
      />
      {tooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className="evaluation-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
