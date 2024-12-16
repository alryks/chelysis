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
    setBestMoves,
    setGame,
    setMultiPV,
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

function calculateAccuracy(bestEval, moveEval) {
    let value = null;
    if (bestEval.scoreType === "mate" && moveEval.scoreType === "mate") {
        if (bestEval.score > 0 && moveEval.score > 0) {
            value = (bestEval.score / moveEval.score) * 100;
        } else if (bestEval.score < 0 && moveEval.score < 0) {
            value = (moveEval.score / bestEval.score) * 100;
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

    if (value === null) {
        return {
            accuracy:
                (100 /
                    (1 +
                        Math.pow(
                            10 / Math.E,
                            bestEval.score - moveEval.score
                        ))) *
                2,
            classification:
                (100 /
                    (1 +
                        Math.exp((bestEval.score - moveEval.score) / Math.E))) *
                2,
        };
    } else {
        return {
            accuracy: value,
            classification: value,
        };
    }
}

function getAttackerDefenderDifference(game, nextMove) {
    let attacker = 0;
    let defender = 0; // who made first move

    const maxDefender = { value: null, moveCount: null };
    const maxAttacker = { value: null, moveCount: null };

    const position = nextMove.to;

    const pieceCost = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
        k: 1000,
    };
    const startTurn = game.turn();
    let moveCount = 0;
    while (nextMove !== null) {
        let buffer = 0;
        buffer += game.get(position) ? pieceCost[game.get(position).type] : 0;
        buffer += nextMove.promotion ? pieceCost[nextMove.promotion] : 0;
        if (startTurn === game.turn()) {
            defender += buffer;
        } else {
            attacker += buffer;
        }
        game.move(nextMove);
        moveCount++;

        const moves = game
            .moves({ verbose: true })
            .filter((move) => move.to === position);
        const moveValues = moves.map((move, index) => [
            index,
            pieceCost[move.piece],
        ]);
        const minMove = moveValues.reduce(
            (min, move) => (move[1] < min[1] ? move : min),
            [null, Infinity]
        );
        nextMove = minMove[0] !== null ? moves[minMove[0]] : null;

        if (game.turn() === startTurn) {
            if (
                maxDefender.value === null ||
                maxDefender.value < defender - attacker
            ) {
                maxDefender.value = defender - attacker;
                maxDefender.moveCount = moveCount;
            }
            if (nextMove === null) {
                if (
                    maxAttacker.value === null ||
                    maxAttacker.value < attacker - defender
                ) {
                    maxAttacker.value = attacker - defender;
                    maxAttacker.moveCount = moveCount;
                }
            }
        } else {
            if (
                maxAttacker.value === null ||
                maxAttacker.value < attacker - defender
            ) {
                maxAttacker.value = attacker - defender;
                maxAttacker.moveCount = moveCount;
            }
            if (nextMove === null) {
                if (
                    maxDefender.value === null ||
                    maxDefender.value < defender - attacker
                ) {
                    maxDefender.value = defender - attacker;
                    maxDefender.moveCount = moveCount;
                }
            }
        }
    }

    let result = attacker - defender;
    if (maxDefender.moveCount !== null && maxAttacker.moveCount === null) {
        result = -maxDefender.value;
    } else if (
        maxAttacker.moveCount !== null &&
        maxDefender.moveCount === null
    ) {
        result = maxAttacker.value;
    } else if (
        maxAttacker.moveCount !== null &&
        maxDefender.moveCount !== null
    ) {
        if (maxAttacker.moveCount >= maxDefender.moveCount) {
            result = -maxDefender.value;
        } else {
            result = maxAttacker.value;
        }
    }

    return result;
}

function isSacrifice(game, move) {
    const board = new Chess(game.fen());
    const moveObj = {
        from: move.slice(0, 2),
        to: move.slice(2, 4),
    };
    if (move.length > 4) {
        moveObj.promotion = move[4];
    }

    const attackerDefenderDifference = getAttackerDefenderDifference(
        board,
        moveObj
    );

    return attackerDefenderDifference > 0;
}

function isPawn(game, move) {
    return game.get(move.slice(0, 2)).type === "p";
}

function classifyMoves(game, moveEvaluations, opponentMoveClassification) {
    let { bestMoves, playedMove } = moveEvaluations;
    bestMoves = bestMoves.filter((move) => move.move !== null);

    if (bestMoves.length >= 1) {
        // First best move
        bestMoves[0].classification = "best";

        if (
            isSacrifice(game, bestMoves[0].move) &&
            !isPawn(game, bestMoves[0].move)
        ) {
            bestMoves[0].classification = "brilliant";
        }

        if (bestMoves.length === 1) {
            bestMoves[0].classification = "forced";
        } else {
            // Second best move
            if (
                calculateAccuracy(bestMoves[0], bestMoves[1]).classification >=
                80
            ) {
                bestMoves[1].classification = "excellent";
                if (
                    isSacrifice(game, bestMoves[1].move) &&
                    !isPawn(game, bestMoves[1].move)
                ) {
                    bestMoves[1].classification = "brilliant";
                }
            } else if (
                calculateAccuracy(bestMoves[0], bestMoves[1]).classification >=
                60
            ) {
                bestMoves[1].classification = "inaccuracy";
                if (
                    opponentMoveClassification === "mistake" ||
                    opponentMoveClassification === "blunder"
                ) {
                    bestMoves[1].classification = "miss";
                }
            } else {
                bestMoves[1].classification = "mistake";
            }

            if (bestMoves.length >= 3) {
                // Third best move
                if (
                    calculateAccuracy(bestMoves[0], bestMoves[2])
                        .classification >= 80
                ) {
                    bestMoves[2].classification = "excellent";
                } else if (
                    calculateAccuracy(bestMoves[0], bestMoves[2])
                        .classification >= 60
                ) {
                    bestMoves[2].classification = "inaccuracy";
                    if (
                        bestMoves[1].classification === "excellent" ||
                        bestMoves[1].classification === "brilliant"
                    ) {
                        bestMoves[2].classification = "good";
                    }
                    if (
                        opponentMoveClassification === "mistake" ||
                        opponentMoveClassification === "blunder"
                    ) {
                        bestMoves[2].classification = "miss";
                    }
                } else if (
                    isSacrifice(game, bestMoves[2].move) ||
                    calculateAccuracy(bestMoves[0], bestMoves[2])
                        .classification === 0
                ) {
                    bestMoves[2].classification = "blunder";
                } else {
                    bestMoves[2].classification = "mistake";
                }

                if (bestMoves.length >= 4) {
                    // Fourth best move
                    if (
                        calculateAccuracy(bestMoves[0], bestMoves[3])
                            .classification >= 60
                    ) {
                        bestMoves[3].classification = "inaccuracy";
                        if (bestMoves[2].classification === "excellent") {
                            bestMoves[3].classification = "good";
                        }
                        if (
                            opponentMoveClassification === "mistake" ||
                            opponentMoveClassification === "blunder"
                        ) {
                            bestMoves[3].classification = "miss";
                        }
                    } else if (
                        isSacrifice(game, bestMoves[3].move) ||
                        calculateAccuracy(bestMoves[0], bestMoves[3])
                            .classification === 0
                    ) {
                        bestMoves[3].classification = "blunder";
                    } else {
                        bestMoves[3].classification = "mistake";
                    }

                    if (bestMoves.length >= 5) {
                        // Fifth best move
                        if (
                            calculateAccuracy(bestMoves[0], bestMoves[4])
                                .classification >= 60
                        ) {
                            bestMoves[4].classification = "inaccuracy";
                            if (bestMoves[2].classification === "excellent") {
                                bestMoves[4].classification = "good";
                            }
                            if (
                                opponentMoveClassification === "mistake" ||
                                opponentMoveClassification === "blunder"
                            ) {
                                bestMoves[4].classification = "miss";
                            }
                        } else if (
                            isSacrifice(game, bestMoves[4].move) ||
                            calculateAccuracy(bestMoves[0], bestMoves[4])
                                .classification === 0
                        ) {
                            bestMoves[4].classification = "blunder";
                        } else {
                            bestMoves[4].classification = "mistake";
                        }
                    }
                }
            }

            if (
                ["inaccuracy", "miss", "blunder", "mistake"].includes(
                    bestMoves[1].classification
                )
            ) {
                bestMoves[0].classification = "greatFind";
            }
        }
    }

    for (const move of bestMoves) {
        const moveObj = {
            from: move.move.slice(0, 2),
            to: move.move.slice(2, 4),
        };
        if (move.move.length > 4) {
            moveObj.promotion = move.move[4];
        }
        game.move(moveObj);
        if (findOpening(game.fen())) {
            move.classification = "book";
        }
        game.undo();
    }

    for (const move of bestMoves) {
        if (playedMove.move === move.move) {
            playedMove.classification = move.classification;
            return { bestMoves, playedMove };
        }
    }

    if (calculateAccuracy(bestMoves[0], playedMove).classification >= 60) {
        playedMove.classification = "inaccuracy";
        if (
            opponentMoveClassification === "mistake" ||
            opponentMoveClassification === "blunder"
        ) {
            playedMove.classification = "miss";
        }
    } else if (
        isSacrifice(game, playedMove.move) ||
        calculateAccuracy(bestMoves[0], playedMove).classification === 0
    ) {
        playedMove.classification = "blunder";
    } else {
        playedMove.classification = "mistake";
    }

    const moveObj = {
        from: playedMove.move.slice(0, 2),
        to: playedMove.move.slice(2, 4),
    };
    if (playedMove.move.length > 4) {
        moveObj.promotion = playedMove.move[4];
    }
    game.move(moveObj);
    if (findOpening(game.fen())) {
        playedMove.classification = "book";
    }
    game.undo();

    return { bestMoves, playedMove };
}

function Analysis() {
    const dispatch = useDispatch();

    const game = useSelector((state) => state.game.game);
    const currentMove = useSelector((state) => state.game.currentMove);
    const multiPV = useSelector((state) => state.game.multiPV);

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
            const { bestMoves, playedMove } = classifyMoves(
                new Chess(game[currentMove - 1].fen),
                {
                    bestMoves: JSON.parse(
                        JSON.stringify(game[currentMove - 1].bestMoves.moves)
                    ),
                    playedMove: JSON.parse(
                        JSON.stringify(game[currentMove - 1].playedMove.move)
                    ),
                },
                currentMove > 1
                    ? game[currentMove - 2].playedMove.classification
                    : null
            );
            dispatch(
                setBestMoves({
                    ...game[currentMove - 1].bestMoves,
                    moves: bestMoves,
                })
            );
            dispatch(
                setPlayedMove({
                    ...game[currentMove - 1].playedMove,
                    move: playedMove,
                })
            );

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
            const accuracy = calculateAccuracy(
                game[i].bestMoves.moves[0],
                game[i].playedMove.move
            ).accuracy;
            if (!accuracy) continue;
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
                : 0;
        const blackAccuracy =
            blackAccuracies.length > 0
                ? blackAccuracies.reduce((a, b) => a + b, 0) /
                  blackAccuracies.length
                : 0;
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
        <div className={styles.analysis}>
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
                        value={multiPV}
                        onChange={(e) =>
                            dispatch(setMultiPV(parseInt(e.target.value)))
                        }
                        className={styles.slider}
                    />
                    <span className={styles.arrowsCount}>{multiPV}</span>
                </div>
            </div>
        </div>
    );
}

export default Analysis;
