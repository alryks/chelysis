import styles from "./EvalBar.module.css";
import { useState } from "react";

function EvalBar({ orientation, value, turn }) {
    const [isHovered, setIsHovered] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        setMousePosition({
            x: e.clientX,
            y: e.clientY,
        });
    };

    let heightPercentage;
    let formattedValue;

    if (value.scoreType === null || value.score === null) {
        value = {score: 0, scoreType: 'cp'};
    }
    if (value.scoreType === 'mate') {
        heightPercentage = value.score > 0 ^ turn === 'b' ? 100 : 0;
        formattedValue = `M${Math.abs(value.score)}`;
    } else {
        const correctedScore = turn === 'w' ? value.score : value.score * -1;
        formattedValue = correctedScore > 0 ? `+${correctedScore.toFixed(1)}` : correctedScore.toFixed(1);
        heightPercentage = 100 / (1 + Math.exp(-correctedScore / Math.E));
    }

    return (
        <div
            className={styles.EvalBar}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMouseMove}
        >
            <div
                className={`${styles.line} ` + (orientation === "white" ? styles.black : styles.white)}
                style={{ height: `${100 - heightPercentage}%` }}
            />
            <div
                className={`${styles.line} ` + (orientation === "white" ? styles.white : styles.black)}
                style={{ height: `${heightPercentage}%` }}
            />
            {isHovered && (
                <div
                    className={styles.value}
                    style={{
                        position: "fixed",
                        left: `${mousePosition.x}px`,
                        top: `${mousePosition.y}px`,
                    }}
                >
                    {formattedValue}
                </div>
            )}
        </div>
    );
}

export default EvalBar;
