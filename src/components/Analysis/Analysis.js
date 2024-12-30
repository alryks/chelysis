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
                        Math.pow(
                            Math.PI,
                            (bestEval.score - moveEval.score) / Math.PI
                        ))) *
                2,
        };
    } else {
        return {
            accuracy: value,
            classification: value,
        };
    }
}

const pieceCost = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
};

function getAttackers(game) {
    const attackers = {};
    for (const attacker of game.moves({ verbose: true })) {
        if (!attacker.captured) continue;
        attackers[attacker.to] = attackers[attacker.to]
            ? [...attackers[attacker.to], attacker]
            : [attacker];
    }
    // sort each array in attackers by piece value
    for (const square in attackers) {
        attackers[square].sort((a, b) => {
            return pieceCost[a.piece] - pieceCost[b.piece];
        });
    }
    return attackers;
}

function getDefenders(game) {
    const board = new Chess(game.fen());
    const defenders = {};
    for (const attacker of board.moves({ verbose: true })) {
        if (!attacker.captured) continue;
        board.move(attacker);
        let moves = board
            .moves({ verbose: true })
            .filter((move) => move.to === attacker.to);
        if (!defenders[attacker.to]) {
            defenders[attacker.to] = moves;
        } else {
            // append only moves that are not already in defenders, check that comparing lan
            moves = moves.filter(
                (move) =>
                    !defenders[attacker.to].some((m) => m.lan === move.lan)
            );
            defenders[attacker.to] = [...defenders[attacker.to], ...moves];
        }
        board.undo();
    }
    // sort each array in defenders by piece value
    for (const square in defenders) {
        defenders[square].sort((a, b) => {
            return pieceCost[a.piece] - pieceCost[b.piece];
        });
    }
    return defenders;
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

    let attackerValue = 0;
    const targetPiece = board.get(moveObj.to);
    let defenderValue =
        targetPiece && targetPiece.type ? pieceCost[targetPiece.type] : 0;


    board.move(moveObj);

    const attackers = getAttackers(board);
    const defenders = getDefenders(board);

    let pawnTaken = false;

    for (const square in attackers) {
        let lastPiece = board.get(square).type;

        while (attackers[square].length > 0) {
            if (
                pieceCost[lastPiece] < pieceCost[attackers[square][0].piece] &&
                defenders[square] &&
                defenders[square].length > 0
            ) {
                break;
            }
            if (lastPiece === "p") pawnTaken = true;

            attackerValue += pieceCost[lastPiece];
            lastPiece = attackers[square].shift().piece;
            if (attackers[square].length === 0) {
                if (!defenders[square] || defenders[square].length === 0) {
                    break;
                }
                if (lastPiece === "p") pawnTaken = true;

                defenderValue += pieceCost[lastPiece];
                break;
            }
            if (!defenders[square] || defenders[square].length === 0) {
                break;
            }
            if (pieceCost[lastPiece] < pieceCost[defenders[square][0].piece]) {
                break;
            }
            if (lastPiece === "p") pawnTaken = true;

            defenderValue += pieceCost[lastPiece];
            lastPiece = defenders[square].shift().piece;

            if (!defenders[square] || defenders[square].length === 0) {
                if (attackers[square].length === 0) {
                    break;
                }
                if (lastPiece === "p") pawnTaken = true;

                attackerValue += pieceCost[lastPiece];
                lastPiece = attackers[square].shift().piece;
            }
            if (attackers[square].length === 0) {
                break;
            }
            if (pieceCost[lastPiece] < pieceCost[attackers[square][0].piece]) {
                break;
            }
        }
    }

    return {
        sacrifice: attackerValue - defenderValue,
        pawnTaken,
    };
}

function isPawn(game, move) {
    return game.get(move.slice(0, 2)).type === "p";
}

function isKing(game, move) {
    return game.get(move.slice(0, 2)).type === "k";
}

function isBrilliant(game, playedMove, secondBestMove, accuracy) {
    const { sacrifice, pawnTaken } = isSacrifice(game, playedMove.move);
    return (
        accuracy > 90 &&
        sacrifice > 0 &&
        !pawnTaken &&
        (playedMove.scoreType !== "mate" && playedMove.score >= -1 || playedMove.scoreType === "mate" && playedMove.score > 0) &&
        (secondBestMove.scoreType !== "mate" && secondBestMove.score <= 1 || secondBestMove.scoreType === "mate" && secondBestMove.score < 0) &&
        !isPawn(game, playedMove.move) &&
        (!isKing(game, playedMove.move) || !game.isCheck())
    );
}

function isGreatFind(prevGame, playedMove, secondBestMove) {
    if (prevGame && isSacrifice(new Chess(prevGame.fen), prevGame.playedMove.move.move).sacrifice >= 0)
        return false;
    if (playedMove.scoreType !== "mate") {
        if (secondBestMove.scoreType === "mate")
            return true;
        if ((playedMove.score > 1 && secondBestMove.score <= 1) || (playedMove.score > -1 && secondBestMove.score <= -1))
            return true;
    }
    else if (playedMove.score > 0) {
        if (secondBestMove.scoreType === "mate") {
            if (secondBestMove.score > 0)
                return false;
            else
                return true;
        }
        else {
            return true;
        }
    }
    else {
        return false;
    }
}

function classifyMoves(game, prevGame, moveEvaluations) {
    let { bestMoves, playedMove } = moveEvaluations;
    bestMoves = bestMoves.filter((move) => move.move !== null);

    if (bestMoves.length === 0) return null;

    const moveObj = {
        from: playedMove.move.slice(0, 2),
        to: playedMove.move.slice(2, 4),
    };
    if (playedMove.move.length > 4) {
        moveObj.promotion = playedMove.move[4];
    }
    game.move(moveObj);
    if (findOpening(game.fen())) {
        return "book";
    }
    game.undo();

    if (bestMoves.length === 1) return "forced";

    const accuracy = calculateAccuracy(bestMoves[0], playedMove).classification;

    let classification = null;
    if (bestMoves[0].move === playedMove.move) {
        classification = "best";
        if (isGreatFind(prevGame, playedMove, bestMoves[1]))
            classification = "greatFind";
        if (isBrilliant(game, playedMove, bestMoves[1], accuracy))
            classification = "brilliant";
        return classification;
    }

    if (accuracy === 0) return "blunder";
    if (accuracy <= 70 && isSacrifice(game, playedMove.move).sacrifice > 0) return "blunder";
    if (70 < accuracy && accuracy <= 90) {
        if (
            ["mistake", "blunder", "miss"].includes(
                prevGame ? prevGame.playedMove.move.classification : null
            )
        )
            return "miss";
        if (
            playedMove.scoreType !== "mate" &&
            bestMoves[0].score >= 0.1 &&
            playedMove.score <= -0.1
        )
            return "mistake";
    }
    if (accuracy > 80) {
        if (
            playedMove.scoreType !== "mate" &&
            bestMoves[0].score >= 0.1 &&
            Math.abs(playedMove.score) < 0.1
        )
            return "inaccuracy";
        if (
            playedMove.scoreType !== "mate" &&
            Math.abs(bestMoves[0].score) < 0.1 &&
            playedMove.score <= -0.1
        )
            return "inaccuracy";
        if (accuracy > 90) return "excellent";
        return "good";
    }
    return "good";
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
