import { ReactComponent as Forced } from "../../assets/move_classification/forced.svg";
import { ReactComponent as Best } from "../../assets/move_classification/best.svg";
import { ReactComponent as Brilliant } from "../../assets/move_classification/brilliant.svg";
import { ReactComponent as GreatFind } from "../../assets/move_classification/greatFind.svg";
import { ReactComponent as Excellent } from "../../assets/move_classification/excellent.svg";
import { ReactComponent as Good } from "../../assets/move_classification/good.svg";
import { ReactComponent as Book } from "../../assets/move_classification/book.svg";
import { ReactComponent as Inaccuracy } from "../../assets/move_classification/inaccuracy.svg";
import { ReactComponent as Miss } from "../../assets/move_classification/miss.svg";
import { ReactComponent as Blunder } from "../../assets/move_classification/blunder.svg";
import { ReactComponent as Mistake } from "../../assets/move_classification/mistake.svg";

import {
    IconChevronLeft,
    IconChevronsLeft,
    IconChevronRight,
    IconChevronsRight,
    IconToggleLeft,
    IconToggleRight,
    IconRefresh,
} from "@tabler/icons-react";

import styles from "./Analysis.module.css";

import { Chess } from "chess.js";
import { useState, useEffect, createElement } from "react";
import openings from "../../assets/openings.json";
import { useDispatch, useSelector } from "react-redux";
import {
    evaluateCurrentMove,
    findBestMoves,
    startStockfish,
    stopStockfish,
    switchAnalysis,
} from "../../state/analysis/analysisSlice";
import {
    goBack,
    goForward,
    goToEnd,
    goToStart,
    setArrowsCount,
    setBestMoves,
    setGame,
    setPlayedMove,
    switchBoardOrientation,
} from "../../state/game/gameSlice";

const moveClassifications = {
    brilliant: { icon: Brilliant, label: "Brilliant" },
    greatFind: { icon: GreatFind, label: "Great find" },
    best: { icon: Best, label: "Best" },
    excellent: { icon: Excellent, label: "Excellent" },
    good: { icon: Good, label: "Good" },
    book: { icon: Book, label: "Book" },
    inaccuracy: { icon: Inaccuracy, label: "Inaccuracy" },
    mistake: { icon: Mistake, label: "Mistake" },
    miss: { icon: Miss, label: "Miss" },
    blunder: { icon: Blunder, label: "Blunder" },
    forced: { icon: Forced, label: "Forced" },
};

function findOpening(fen) {
    const opening = openings[fen];
    return opening || null;
}

function calculateWinChance(score) {
    return 100 / (1 + Math.exp(-score / Math.E));
}

function calculateAccuracy(bestEval, moveEval) {
    let value = null;
    if (bestEval.scoreType === "mate" && moveEval.scoreType === "mate") {
        if (bestEval.score > 0 && moveEval.score > 0) {
            value = 100;
        } else if (bestEval.score < 0 && moveEval.score < 0) {
            value = 100;
        } else if (bestEval.score > 0 && moveEval.score < 0) {
            value = 0;
        } else {
            value = 100;
        }
    } else if (bestEval.scoreType === "mate") {
        value = 0;
    } else if (moveEval.scoreType === "mate") {
        value = 0;
    }

    if (bestEval.move === moveEval.move) return 100;
    if (bestEval.score < moveEval.score) return 100;

    if (value === null) {
        const winChanceBest = calculateWinChance(bestEval.score);
        const winChanceMove = calculateWinChance(moveEval.score);
        const accuracy =
            100 * Math.exp(-(winChanceBest - winChanceMove) / Math.exp(2));
        return accuracy;
    } else {
        return value;
    }
}

const pieceCost = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: Infinity,
};

function lanToMove(game, lan) {
    const moves = game.moves({ verbose: true });
    for (const move of moves) {
        if (move.lan === lan) return move;
    }
    return null;
}

function getCaptureTree(
    game,
    move,
    value = 0,
    squares,
    alpha = -Infinity,
    beta = -Infinity,
    depth = 0
) {
    const board = new Chess(game.fen());
    if (value !== 0) {
        value = -value;
    }

    let moves = [];
    if (move) {
        board.move(move);

        if (!squares) {
            const firstMoves = board
                .moves({ verbose: true })
                .filter((mv) => mv.captured);
            squares = new Set(firstMoves.map((mv) => mv.to));
            for (const mv of firstMoves) {
                board.move(mv);
                const secondMoves = board
                    .moves({ verbose: true })
                    .filter((mv) => mv.captured);
                for (const m of secondMoves) {
                    squares.add(m.to);
                }
                board.undo();
            }
        }

        if (move.captured) {
            value += pieceCost[move.captured];
        }
        if (move.promotion) {
            value += pieceCost[move.promotion] - 1;
        }

        moves = board
            .moves({ verbose: true })
            .filter((mv) => mv.captured && squares.has(mv.to));
        if (moves.length < board.moves().length && moves.length !== 0) {
            moves.push(null);
            if (value < 0 || depth === 12) moves = [];
        }
    }

    let bestValue = -Infinity;
    let bestMove = -1;

    const children = [];
    for (const [i, mv] of moves.entries()) {
        const tree = getCaptureTree(
            board,
            mv,
            value,
            squares
                ? squares
                : moves.filter((m) => m !== null).map((m) => m.to),
            beta,
            alpha,
            depth + 1
        );
        if (
            -tree.bestValue > bestValue ||
            (-tree.bestValue === bestValue && mv === null)
        ) {
            bestValue = tree.bestValue === 0 ? 0 : -tree.bestValue;
            bestMove = i;
        }
        children.push(tree);

        alpha = Math.max(alpha, bestValue);
        if (alpha >= -beta) break;
    }

    if (bestMove === -1) bestValue = value === 0 ? 0 : -value;

    return { value, move, children, bestValue, bestMove };
}

function isSacrifice(game, move, captureTree) {
    const moveObj = lanToMove(game, move);

    let pawnTaken = false;
    let pieceCaptured = moveObj.captured !== undefined;

    let subTree = captureTree;
    let depth = 0;
    do {
        if (subTree.move && subTree.move.captured) {
            pieceCaptured = true;
            if (depth % 2 === 1 && subTree.move.captured === "p")
                pawnTaken = true;
        }
        if (subTree.bestMove === -1) break;
        subTree = subTree.children[subTree.bestMove];
        depth++;
    } while (true);

    return {
        sacrifice: captureTree.bestValue,
        pawnTaken,
        pieceCaptured,
    };
}

function isPawn(game, move) {
    return game.get(move.slice(0, 2)).type === "p";
}

function isKing(game, move) {
    return game.get(move.slice(0, 2)).type === "k";
}

function isBrilliant(game, playedMove, secondBestMove, captureTree) {
    // TODO: identify middlegame and endgame
    const { sacrifice, pawnTaken, pieceCaptured } = isSacrifice(
        game,
        playedMove.move,
        captureTree
    );
    // console.log(playedMove.move, captureTree)
    return (
        sacrifice > 0 &&
        !pawnTaken &&
        ((playedMove.scoreType !== "mate" &&
            calculateWinChance(playedMove.score) > 30) ||
            (playedMove.scoreType === "mate" && playedMove.score > 0)) &&
        ((secondBestMove.scoreType !== "mate" &&
            calculateWinChance(secondBestMove.score) <= 85) ||
            (secondBestMove.scoreType === "mate" &&
                secondBestMove.score < 0)) &&
        !isPawn(game, playedMove.move) &&
        (!isKing(game, playedMove.move) || !game.isCheck())
    );
}

function isGreatFind(prevGame, game, playedMove, secondBestMove, captureTree) {
    // check for trades
    const { sacrifice, pawnTaken, pieceCaptured } = isSacrifice(
        game,
        playedMove.move,
        captureTree
    );
    if (sacrifice <= 0 && pieceCaptured) return false;

    if (playedMove.scoreType !== "mate") {
        if (secondBestMove.scoreType === "mate") return true;
        if (
            (calculateWinChance(playedMove.score) > 70 &&
                calculateWinChance(secondBestMove.score) <= 70) ||
            (calculateWinChance(playedMove.score) > 30 &&
                calculateWinChance(secondBestMove.score) <= 30)
        )
            return true;
    } else if (playedMove.score > 0) {
        if (secondBestMove.scoreType === "mate") {
            if (secondBestMove.score > 0) return false;
            else return true;
        } else {
            return true;
        }
    } else {
        return false;
    }
}

function classifyMoves(game, prevGame, moveEvaluations) {
    let { bestMoves, playedMove } = moveEvaluations;
    bestMoves = bestMoves.filter((move) => move.move !== null);

    if (bestMoves.length === 0) return null;

    const moveObj = lanToMove(game, playedMove.move);

    game.move(moveObj);
    if (findOpening(game.fen())) {
        return "book";
    }
    game.undo();

    if (bestMoves.length === 1) return "forced";

    const accuracy = calculateAccuracy(bestMoves[0], playedMove);

    let classification = null;
    if (bestMoves[0].move === playedMove.move) {
        classification = "best";
        const captureTree = getCaptureTree(game, moveObj);
        if (isGreatFind(prevGame, game, playedMove, bestMoves[1], captureTree))
            classification = "greatFind";
        if (isBrilliant(game, playedMove, bestMoves[1], captureTree))
            classification = "brilliant";
        return classification;
    }

    if (accuracy <= 65) {
        if (
            ["mistake", "blunder", "miss"].includes(
                prevGame ? prevGame.playedMove.move.classification : null
            )
        )
            return "miss";
        if (accuracy <= 20) return "blunder";
        if (
            playedMove.scoreType !== "mate" &&
            Math.max(
                0,
                calculateWinChance(bestMoves[0].score) -
                    calculateWinChance(playedMove.score)
            ) > 7
        )
            return "mistake";
    }

    if (accuracy > 65) {
        if (
            (playedMove.scoreType !== "mate" &&
                Math.max(
                    0,
                    calculateWinChance(bestMoves[0].score) -
                        calculateWinChance(playedMove.score)
                ) <= 10) ||
            (bestMoves[0].scoreType === "mate" &&
                playedMove.scoreType === "mate")
        ) {
            if (accuracy > 90) return "excellent";
            return "good";
        }
    }
    return "inaccuracy";
}

function Analysis({ analysisHeight }) {
    const dispatch = useDispatch();

    const game = useSelector((state) => state.game.game);
    const currentMove = useSelector((state) => state.game.currentMove);
    const arrowsCount = useSelector((state) => state.game.arrowsCount);

    const stockfishOn = useSelector((state) => state.analysis.stockfishOn);
    const stockfishReady = useSelector(
        (state) => state.analysis.stockfishReady
    );
    const stockfishBestMoves = useSelector(
        (state) => state.analysis.stockfishBestMoves
    );
    const stockfishCurrentMove = useSelector(
        (state) => state.analysis.stockfishCurrentMove
    );

    const analysisOn = useSelector((state) => state.analysis.analysisOn);

    const [pgn, setPgn] = useState("");

    const [analysisError, setAnalysisError] = useState(null);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    useEffect(() => {
        if (!stockfishOn) return;

        if (
            currentMove > 0 &&
            game[currentMove - 1].playedMove.status === "done" &&
            game[currentMove - 1].bestMoves.status === "done"
        ) {
            const classification = classifyMoves(
                new Chess(game[currentMove - 1].fen),
                currentMove > 1 ? game[currentMove - 2] : null,
                {
                    bestMoves: game[currentMove - 1].bestMoves.moves,
                    playedMove: game[currentMove - 1].playedMove.move,
                }
            );
            const newPlayedMove = {
                ...game[currentMove - 1].playedMove,
                move: {
                    ...game[currentMove - 1].playedMove.move,
                    classification,
                },
            };
            dispatch(setPlayedMove(newPlayedMove));

            dispatch(
                findBestMoves({
                    fen: game[currentMove].fen,
                    moveIndex: currentMove,
                })
            );
        }
    }, [currentMove > 0 && game[currentMove - 1].playedMove.status]);

    useEffect(() => {
        if (!stockfishOn) return;

        dispatch(setPlayedMove(stockfishCurrentMove));
    }, [stockfishCurrentMove]);

    useEffect(() => {
        if (!stockfishOn) return;

        if (
            stockfishBestMoves.moveIndex < game.length &&
            game[stockfishBestMoves.moveIndex].bestMoves.status !== "done"
        ) {
            dispatch(setBestMoves(stockfishBestMoves));

            if (
                stockfishBestMoves.moveIndex === currentMove - 1 &&
                stockfishBestMoves.status === "done" &&
                game[currentMove - 1].playedMove.status !== "done"
            ) {
                dispatch(
                    evaluateCurrentMove({
                        fen: game[currentMove - 1].fen,
                        move: game[currentMove - 1].playedMove.move.move,
                        moveIndex: currentMove - 1,
                    })
                );
            }

            if (
                stockfishBestMoves.moveIndex === currentMove &&
                stockfishBestMoves.status === "done" &&
                analysisOn
            ) {
                dispatch(goForward());
                setAnalysisProgress(
                    Math.round((currentMove / (game.length - 1)) * 100)
                );
                if (currentMove === game.length - 1) {
                    dispatch(switchAnalysis());
                    setAnalysisProgress(100);
                }
            }
            return;
        }
    }, [stockfishBestMoves]);

    useEffect(() => {
        if (!stockfishOn) return;

        if (stockfishReady) {
            if (currentMove > 0) {
                if (game[currentMove - 1].bestMoves.status !== "done") {
                    dispatch(
                        findBestMoves({
                            fen: game[currentMove - 1].fen,
                            moveIndex: currentMove - 1,
                        })
                    );
                    return;
                }
                if (
                    game[currentMove - 1].bestMoves.status === "done" &&
                    game[currentMove - 1].playedMove.status !== "done"
                ) {
                    dispatch(
                        evaluateCurrentMove({
                            fen: game[currentMove - 1].fen,
                            move: game[currentMove - 1].playedMove.move.move,
                            moveIndex: currentMove - 1,
                        })
                    );
                    return;
                }
            }

            if (game[currentMove].bestMoves.status !== "done") {
                dispatch(
                    findBestMoves({
                        fen: game[currentMove].fen,
                        moveIndex: currentMove,
                    })
                );
                return;
            }
        }
    }, [stockfishReady, currentMove]);

    const handleAnalyze = async () => {
        if (!pgn.trim()) {
            setAnalysisError("Please enter a PGN");
            return;
        }

        const chess = new Chess();
        try {
            chess.loadPgn(pgn);
        } catch (error) {
            setAnalysisError(error.message);
            return;
        }

        dispatch(setGame(chess.history({ verbose: true })));

        if (!analysisOn) {
            dispatch(switchAnalysis());
        }

        if (!stockfishOn) {
            dispatch(startStockfish());
        }

        setAnalysisError(null);
        setAnalysisProgress(0);

        dispatch(goToStart());
        dispatch(goForward());
    };

    const getAccuracies = () => {
        const whiteAccuracies = [];
        const blackAccuracies = [];

        for (let i = 0; i < game.length - 1; i++) {
            if (game[i].playedMove.move.classification === "book") continue;

            const accuracy = calculateAccuracy(
                game[i].bestMoves.moves[0],
                game[i].playedMove.move
            );

            if (i % 2 === 0) {
                whiteAccuracies.push(accuracy);
            } else {
                blackAccuracies.push(accuracy);
            }
        }

        const whiteAccuracy =
            whiteAccuracies.length > 0
                ? whiteAccuracies.reduce((a, b) => a + b, 0) /
                  whiteAccuracies.length
                : 100;
        const blackAccuracy =
            blackAccuracies.length > 0
                ? blackAccuracies.reduce((a, b) => a + b, 0) /
                  blackAccuracies.length
                : 100;
        return { whiteAccuracy, blackAccuracy };
    };

    const getOpening = () => {
        let opening = null;
        for (let i = 0; i < currentMove + 1; i++) {
            let openingValue = findOpening(game[i].fen);
            if (openingValue) {
                opening = openingValue.name;
            }
        }
        return opening ? opening : "Start position";
    };

    const getClassifications = () => {
        const classifications = {};
        Object.entries(moveClassifications).forEach(
            ([classification, { icon: Icon, label }]) => {
                classifications[classification] = { white: 0, black: 0 };
            }
        );

        for (let i = 0; i < game.length - 1; i++) {
            const classification = game[i].playedMove.move.classification;
            if (!classification || classification === "normal") continue;
            classifications[classification][i % 2 === 0 ? "white" : "black"]++;
        }
        return classifications;
    };

    return (
        <div className={styles.analysis} style={{ height: analysisHeight }}>
            <div className={styles.content}>
                <div className={styles.start}>
                    <span className={styles.title}>Game analysis</span>
                    <textarea
                        className={styles.pgn}
                        placeholder="Paste PGN here..."
                        value={pgn}
                        onChange={(e) => setPgn(e.target.value)}
                    />
                    <button className={styles.analyze} onClick={handleAnalyze}>
                        Analyze
                    </button>
                    {analysisError && (
                        <div className={styles.error}>{analysisError}</div>
                    )}
                    {analysisOn && !analysisError && (
                        <div className={styles.analyzing}>
                            Analyzing... {analysisProgress}%
                        </div>
                    )}
                </div>
                {analysisProgress === 100 && !analysisError && (
                    <>
                        <div className={styles.accuracy}>
                            <span className={styles.titleLeft}>Accuracy</span>
                            <div className={styles.accuracyValues}>
                                <div
                                    className={`${styles.accuracyValue} ${styles.white}`}
                                >
                                    <span className={styles.accuracyText}>
                                        {getAccuracies().whiteAccuracy.toFixed(
                                            1
                                        )}
                                        %
                                    </span>
                                </div>
                                <div
                                    className={`${styles.accuracyValue} ${styles.black}`}
                                >
                                    <span className={styles.accuracyText}>
                                        {getAccuracies().blackAccuracy.toFixed(
                                            1
                                        )}
                                        %
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className={styles.opening}>
                            <span className={styles.titleLeft}>Opening</span>
                            <div className={styles.openingValue}>
                                <span className={styles.openingText}>
                                    {getOpening()}
                                </span>
                            </div>
                        </div>
                        <div className={styles.classification}>
                            {Object.entries(getClassifications()).map(
                                ([classification, { white, black }]) => (
                                    <div
                                        key={classification}
                                        className={`${styles.classificationRow} ${styles[classification]}`}
                                    >
                                        <span>{white}</span>
                                        <div
                                            className={
                                                styles.classificationTitle
                                            }
                                        >
                                            {createElement(
                                                moveClassifications[
                                                    classification
                                                ].icon,
                                                { className: styles.icon }
                                            )}
                                            <span>
                                                {
                                                    moveClassifications[
                                                        classification
                                                    ].label
                                                }
                                            </span>
                                        </div>
                                        <span>{black}</span>
                                    </div>
                                )
                            )}
                        </div>
                    </>
                )}
            </div>
            <div className={styles.controlsContainer}>
                <div className={styles.upperControls}>
                    <div className={styles.controls}>
                        <button
                            className={styles.control}
                            onClick={() => {
                                if (analysisOn) return;
                                stockfishOn
                                    ? dispatch(stopStockfish())
                                    : dispatch(startStockfish());
                            }}
                        >
                            {stockfishOn ? (
                                <IconToggleRight size={24} />
                            ) : (
                                <IconToggleLeft size={24} />
                            )}
                        </button>
                        <div className={styles.navigation}>
                            <button
                                className={styles.control}
                                onClick={() =>
                                    !analysisOn && dispatch(goToStart())
                                }
                            >
                                <IconChevronsLeft />
                            </button>
                            <button
                                className={styles.control}
                                onClick={() =>
                                    !analysisOn && dispatch(goBack())
                                }
                            >
                                <IconChevronLeft />
                            </button>
                            <button
                                className={styles.control}
                                onClick={() =>
                                    dispatch(switchBoardOrientation())
                                }
                            >
                                <IconRefresh />
                            </button>
                            <button
                                className={styles.control}
                                onClick={() =>
                                    !analysisOn && dispatch(goForward())
                                }
                            >
                                <IconChevronRight />
                            </button>
                            <button
                                className={styles.control}
                                onClick={() =>
                                    !analysisOn && dispatch(goToEnd())
                                }
                            >
                                <IconChevronsRight />
                            </button>
                        </div>
                    </div>
                </div>
                <div className={styles.arrowsControl}>
                    <input
                        type="range"
                        min="0"
                        max="5"
                        value={arrowsCount}
                        onChange={(e) =>
                            dispatch(setArrowsCount(parseInt(e.target.value)))
                        }
                        className={styles.slider}
                    />
                    <span className={styles.arrowsCount}>{arrowsCount}</span>
                </div>
            </div>
        </div>
    );
}

export default Analysis;
