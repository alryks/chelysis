import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { stockfishService } from "./stockfishService";

export const startStockfish = createAsyncThunk(
    "analysis/startStockfish",
    async function initStockfish(_, { dispatch }) {
        let stockfish = stockfishService.start();

        stockfish.onerror = (e) => {
            // console.log("Stockfish error:", e);
            dispatch(handleOnError());
            initStockfish(_, { dispatch });
        };

        stockfish.onmessage = (e) => {
            const message = e.data;
            // console.log(message);
            dispatch(handleOnMessage(message));
        };

        stockfish.postMessage("uci");
        stockfish.postMessage(`setoption name MultiPV value 5}`);
        stockfish.postMessage("ucinewgame");
        stockfish.postMessage("isready");
    }
);

export const analysisSlice = createSlice({
    name: "analysis",
    initialState: {
        stockfishOn: false,
        stockfishReady: false,
        stockfishMove: 0,
        stockfishBestMoves: { status: "done", moveIndex: 0, moves: [] },
        stockfishCurrentMove: { status: "done", moveIndex: 0, move: {classification: "normal"} },

        analysisOn: false,
    },
    reducers: {
        handleOnMessage: (state, action) => {
            const message = action.payload;
            if (message.includes("readyok")) {
                state.stockfishReady = true;
                return;
            }
            if (message.includes("multipv")) {
                const regex =
                    /multipv\s(\d+)\sscore\s(cp|mate)\s(-?\d+).*?pv\s([a-h][1-8][a-h][1-8][qrbn]?)/;
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
                    state.stockfishBestMoves = {
                        status: "pending",
                        moveIndex: state.stockfishMove,
                        moves: newBestMoves,
                    };
                } else if (state.stockfishCurrentMove.status === "pending") {
                    const newEvalMove = {
                        scoreType: scoreType,
                        score:
                            scoreType === "mate"
                                ? parseInt(score)
                                : parseInt(score) / 100,
                        moveIndex: state.stockfishMove,
                        move: move,
                        classification: "normal",
                    };
                    state.stockfishCurrentMove = {
                        status: "pending",
                        moveIndex: state.stockfishMove,
                        move: newEvalMove,
                    };
                }
                return;
            }
            if (message.includes("bestmove")) {
                state.stockfishBestMoves.status = "done";
                state.stockfishCurrentMove.status = "done";
            }
        },
        handleOnError: (state) => {
            stockfishService.terminate();
            state.stockfishReady = false;
        },
        findBestMoves: (state, action) => {
            if (state.stockfishOn && state.stockfishReady) {
                state.stockfishMove = action.payload.moveIndex;
                state.stockfishBestMoves = { status: "pending", moveIndex: action.payload.moveIndex, moves: [] };
                stockfishService.postMessage(`position fen ${action.payload.fen}`);
                stockfishService.postMessage("go depth 12");
            }
        },
        evaluateCurrentMove: (state, action) => {
            if (state.stockfishOn && state.stockfishReady) {
                state.stockfishCurrentMove = { status: "pending", moveIndex: action.payload.moveIndex, move: {classification: "normal"} };
                stockfishService.postMessage(
                    `position fen ${action.payload.fen}`
                );
                stockfishService.postMessage(
                    `go depth 12 searchmoves ${action.payload.move}`
                );
            }
        },
        stopStockfish: (state) => {
            stockfishService.terminate();
            state.stockfishOn = false;
            state.stockfishReady = false;
            state.stockfishMove = 0;
            state.stockfishBestMoves = { status: "done", moveIndex: 0, moves: [] };
            state.stockfishCurrentMove = { status: "done", moveIndex: 0, move: {classification: "normal"} };
        },
        switchAnalysis: (state) => {
            state.analysisOn = !state.analysisOn;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(startStockfish.fulfilled, (state) => {
            state.stockfishOn = true;
        });
    },
});

export const {
    handleOnMessage,
    handleOnError,
    findBestMoves,
    evaluateCurrentMove,
    stopStockfish,
    switchAnalysis,
} = analysisSlice.actions;

export default analysisSlice.reducer;
