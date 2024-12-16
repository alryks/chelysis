import { createSlice } from "@reduxjs/toolkit";

export const analysisSlice = createSlice({
    name: "analysis",
    initialState: {
        stockfishOn: false,
        stockfishEngine: null,
        stockfishReady: false,
        multiPV: 1,
        stockfishBestMoves: { status: "done", moves: [] },
        stockfishCurrentMove: { status: "done", move: {} },

        analysisOn: false,
    },
    reducers: {
        switchStockfish: (state) => {
            const setStockfish = () => {
                let stockfish = new Worker("/stockfish/stockfish.js");

                stockfish.postMessage("uci");
                stockfish.postMessage(
                    `setoption name MultiPV value ${state.multiPV}`
                );
                stockfish.postMessage("ucinewgame");
                stockfish.postMessage("isready");

                stockfish.onerror = (e) => {
                    console.log('Stockfish error:', e);
                    stockfish.terminate();
                    state.stockfishReady = false;
                    state.stockfishEngine = null;
                    setStockfish();
                };

                stockfish.onmessage = (e) => {
                    const message = e.data;
                    console.log(message);
                    if (message.includes("readyok")) {
                        state.stockfishReady = true;
                        return;
                    }
                    if (message.includes("multipv")) {
                        const regex =
                            /multipv\s(\d+)\sscore\s(cp|mate)\s(-?\d+).*?pv\s([a-h][1-8][a-h][1-8])/;
                        const match = message.match(regex);
                        if (match === null) return;
                        const [, pv, scoreType, score, move] = match;

                        if (state.stockfishBestMoves.status === "pending") {
                            const newBestMoves = [...state.stockfishBestMoves.moves];
                            if (pv > newBestMoves.length) {
                                for (let i = newBestMoves.length; i < pv; i++) {
                                    newBestMoves.push({
                                        scoreType: null,
                                        score: null,
                                        move: null,
                                    });
                                }
                            }
                            newBestMoves[pv - 1] = {
                                scoreType: scoreType,
                                score:
                                    scoreType === "mate"
                                        ? parseInt(score)
                                        : parseInt(score) / 100,
                                move: move,
                            };
                            state.stockfishBestMoves = { status: "pending", moves: newBestMoves };
                        } else if (state.stockfishCurrentMove.status === "pending") {
                            const newEvalMove = {
                                scoreType: scoreType,
                                score:
                                        scoreType === "mate"
                                            ? parseInt(score)
                                            : parseInt(score) / 100,
                                move: move,
                            };
                            state.stockfishCurrentMove = { status: "pending", move: newEvalMove };
                        }
                        return;
                    }
                    if (message.includes("bestmove")) {
                        state.stockfishBestMoves = { status: "done", moves: state.stockfishBestMoves.moves };
                        state.stockfishCurrentMove = { status: "done", move: state.stockfishCurrentMove.move };
                    }
                };

                return stockfish;
            };

            state.stockfishOn = !state.stockfishOn;

            if (state.stockfishOn) {
                state.stockfishEngine = setStockfish();
            } else {
                if (state.stockfishEngine) {
                    state.stockfishEngine.terminate();
                    state.stockfishEngine = null;
                }
                state.stockfishReady = false;
                state.stockfishBestMoves = { status: "done", moves: [] };
                state.stockfishCurrentMove = { status: "done", move: {} };
            }
        },
        setMultiPV: (state, action) => {
            state.multiPV = action.payload;
            if (state.stockfishOn && state.stockfishReady) {
                state.stockfishEngine.postMessage(`setoption name MultiPV value ${state.multiPV}`);
                state.stockfishReady = false;
                state.stockfishEngine.postMessage("isready");
            }
        },
        findBestMoves: (state, action) => {
            if (state.stockfishOn && state.stockfishReady) {
                state.stockfishBestMoves = { status: "pending", moves: [] };
                state.stockfishEngine.postMessage(`position fen ${action.payload}`);
                state.stockfishEngine.postMessage("go depth 16 movetime 500");
            }
        },
        evaluateCurrentMove: (state, action) => {
            if (state.stockfishOn && state.stockfishReady) {
                state.stockfishCurrentMove = { status: "pending", move: {} };
                state.stockfishEngine.postMessage(`position fen ${action.payload.fen}`);
                state.stockfishEngine.postMessage(`go depth 16 movetime 500 searchmoves ${action.payload.move}`);
            }
        },
        stopStockfish: (state) => {
            if (state.stockfishOn) {
                state.stockfishEngine.postMessage("stop");
                state.stockfishReady = false;
                state.stockfishBestMoves = { status: "done", moves: [] };
                state.stockfishCurrentMove = { status: "done", move: {} };
                state.stockfishEngine.postMessage("isready");
            }
        },
        switchAnalysis: (state) => {
            state.analysisOn = !state.analysisOn;
        },
    },
});

export const { switchStockfish, setMultiPV, findBestMoves, evaluateCurrentMove, stopStockfish, switchAnalysis } = analysisSlice.actions;

export default analysisSlice.reducer;