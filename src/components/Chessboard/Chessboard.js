import styles from "./Chessboard.module.css";

import { Chess } from "chess.js";

import { Chessboard as ReactChessboard } from "react-chessboard";
import { MoveIndicator } from "../MoveIndicator/MoveIndicator";

import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { move } from "../../state/game/gameSlice";

const moveBackgroundColors = {
    brilliant: "var(--brilliant-background-color)",
    greatFind: "var(--great-find-background-color)",
    best: "var(--best-background-color)",
    excellent: "var(--excellent-background-color)",
    good: "var(--good-background-color)",
    book: "var(--book-background-color)",
    inaccuracy: "var(--inaccuracy-background-color)",
    mistake: "var(--mistake-background-color)",
    miss: "var(--miss-background-color)",
    blunder: "var(--blunder-background-color)",
    forced: "var(--forced-background-color)",
    normal: "var(--move-background-color)",
};

function Chessboard() {
    const dispatch = useDispatch();

    const game = useSelector((state) => state.game.game);
    const currentMove = useSelector((state) => state.game.currentMove);
    const boardOrientation = useSelector(
        (state) => state.game.boardOrientation
    );
    const arrowsCount = useSelector((state) => state.game.arrowsCount);

    const stockfishOn = useSelector((state) => state.analysis.stockfishOn);

    const analysisOn = useSelector((state) => state.analysis.analysisOn);

    const boardWidth = useSelector((state) => state.game.boardWidth);

    const [moveFrom, setMoveFrom] = useState("");
    const [possibleMoves, setPossibleMoves] = useState({});

    const [indicatorMove, setIndicatorMove] = useState(null);
    const [arrows, setArrows] = useState([]);
    const arrowsTimeoutRef = useRef(null);

    function getMoveOptions(square) {
        const gameObj = new Chess(game[currentMove].fen);
        const moves = gameObj.moves({
            square,
            verbose: true,
        });

        const newMoves = {};
        moves.map((move) => {
            newMoves[move.to] = {
                background: gameObj.get(move.to)
                    ? "radial-gradient(circle, rgba(255,0,0,.1) 85%, transparent 85%)"
                    : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                borderRadius: "50%",
            };
            return move;
        });
        return newMoves;
    }

    function makeAMove(mv) {
        try {
            dispatch(move(mv));
            return true;
        } catch (error) {
            return false;
        }
    }

    function onSquareClick(square) {
        if (analysisOn) return;

        const gameObj = new Chess(game[currentMove].fen);
        if (!moveFrom) {
            const piece = gameObj.get(square);
            if (piece && piece.color === gameObj.turn()) {
                setMoveFrom(square);
                setPossibleMoves(getMoveOptions(square));
            }
            return;
        }

        // Попытка сделать ход
        makeAMove({
            from: moveFrom,
            to: square,
        });

        // Сброс выбора в любом случае
        setMoveFrom("");
        setPossibleMoves({});
    }

    function onPieceDragBegin(piece, square) {
        onSquareClick(square);
    }

    function onDrop(sourceSquare, targetSquare) {
        if (analysisOn) return false;

        const move = makeAMove({
            from: sourceSquare,
            to: targetSquare,
        });

        setMoveFrom("");
        setPossibleMoves({});
        return move;
    }

    function onPromotionPieceSelect(piece, promoteFromSquare, promoteToSquare) {
        if (analysisOn || !piece) return false;

        const move = makeAMove({
            from: promoteFromSquare,
            to: promoteToSquare,
            promotion: piece[1].toLowerCase(),
        });

        return move;
    }

    // Получаем позиции королей
    function getKingPositions() {
        const gameObj = new Chess(game[currentMove].fen);
        const positions = {};
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const square = String.fromCharCode(97 + i) + (j + 1);
                const piece = gameObj.get(square);
                if (piece && piece.type === "k") {
                    positions[piece.color] = square;
                }
            }
        }
        return positions;
    }

    // Создаем кастомные стили для квадратов
    function getCustomSquareStyles() {
        const kingPositions = getKingPositions();
        const customStyles = { ...possibleMoves };

        const gameObj = new Chess(game[currentMove].fen);
        // Добавляем индикаторы шаха/мата/пата
        if (gameObj.isCheckmate()) {
            customStyles[kingPositions[gameObj.turn()]] = {
                background:
                    "radial-gradient(circle, rgba(0,0,0,.4) 85%, transparent 85%)",
                borderRadius: "50%",
            };
        } else if (gameObj.isDraw()) {
            customStyles[kingPositions.w] = {
                background:
                    "radial-gradient(circle, rgba(0,0,0,.4) 85%, transparent 85%)",
                borderRadius: "50%",
            };
            customStyles[kingPositions.b] = {
                background:
                    "radial-gradient(circle, rgba(0,0,0,.4) 85%, transparent 85%)",
                borderRadius: "50%",
            };
        } else if (gameObj.isCheck()) {
            customStyles[kingPositions[gameObj.turn()]] = {
                background:
                    "radial-gradient(circle, rgba(255,0,0,.4) 85%, transparent 85%)",
                borderRadius: "50%",
            };
        }

        // Add background colors and indicators for moves
        if (indicatorMove) {
            const indicatorFrom = indicatorMove.move.slice(0, 2);
            const indicatorTo = indicatorMove.move.slice(2, 4);
            if (!customStyles[indicatorFrom]) {
                customStyles[indicatorFrom] = indicatorMove.style;
            }
            if (!customStyles[indicatorTo]) {
                customStyles[indicatorTo] = indicatorMove.style;
            }
        }

        return customStyles;
    }

    useEffect(() => {
        clearInterval(arrowsTimeoutRef.current);
        arrowsTimeoutRef.current = null;
    }, [currentMove]);

    useEffect(() => {
        const updateArrows = () => {
            if (stockfishOn && game[currentMove].bestMoves.moves.length > 0) {
                const newMoves = [];
                game[currentMove].bestMoves.moves.forEach((move) => {
                    if (!move.move) return;
                    const moveStr = `${move.move.slice(0, 2)}${move.move.slice(2, 4)}`;
                    if (!newMoves.includes(moveStr)) {
                        newMoves.push(moveStr);
                    }
                });
                
                const newArrows = newMoves.slice(0, arrowsCount).map((move, index) => [
                    move.slice(0, 2),
                    move.slice(2, 4),
                    `rgba(255, 255, 255, ${1 - index * 0.2})`,
                ]);
                
                setArrows(newArrows);
            } else {
                setArrows([]);
            }
            if (arrowsTimeoutRef.current) {
                arrowsTimeoutRef.current = null;
            }
        };

        // Устанавливаем новый интервал
        if (stockfishOn && (!arrowsTimeoutRef.current || game[currentMove].bestMoves.status === "done")) {
            arrowsTimeoutRef.current = setTimeout(updateArrows, 100);
        }
    }, [stockfishOn, currentMove, arrowsCount, game[currentMove].bestMoves]);

    useEffect(() => {
        setArrows([]);
    }, [currentMove]);

    useEffect(() => {
        if (currentMove === 0) {
            setIndicatorMove(null);
            return;
        }

        const playedMove = game[currentMove - 1].playedMove;
        let style = {};
        if (playedMove.move.classification) {
            style = {
                background:
                moveBackgroundColors[playedMove.move.classification],
            };
        } else {
            style = {
                background: "var(--move-background-color)",
            };
        }
        const indicatorMove = { ...playedMove.move, style: style };
        if (playedMove.status === "set" || playedMove.status === "pending")
            indicatorMove.classification = "normal";
        setIndicatorMove(indicatorMove);
    }, [currentMove > 0 && game[currentMove - 1].playedMove.move.classification, currentMove]);

    return (
        <div className={styles.chessboard}>
            <ReactChessboard
                animationDuration={50}
                boardWidth={boardWidth}
                position={game[currentMove].fen}
                onPieceDrop={onDrop}
                onPromotionPieceSelect={onPromotionPieceSelect}
                onSquareClick={onSquareClick}
                onPieceDragBegin={onPieceDragBegin}
                boardOrientation={boardOrientation}
                customSquareStyles={getCustomSquareStyles()}
                customDarkSquareStyle={{
                    backgroundColor: "var(--primary-color)",
                }}
                customLightSquareStyle={{
                    backgroundColor: "var(--secondary-color)",
                }}
                customArrows={arrows}
            />
            {indicatorMove && indicatorMove.classification !== "normal" && (
                <MoveIndicator
                    classification={indicatorMove.classification}
                    square={indicatorMove.move.slice(2, 4)}
                    boardOrientation={boardOrientation}
                    width={boardWidth}
                />
            )}
        </div>
    );
}

export default Chessboard;
