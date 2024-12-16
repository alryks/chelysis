import { createSlice } from "@reduxjs/toolkit";
import { Chess } from "chess.js";

export const gameSlice = createSlice({
    name: "game",
    initialState: {
        game: [
            {
                fen: new Chess().fen(),
                bestMoves: { status: "set", multiPV: 0, moves: [] },
                playedMove: null,
            },
        ],
        currentMove: 0,
        boardOrientation: "white",
        multiPV: 1,
        boardWidth: 600,
    },
    reducers: {
        setGame: (state, action) => {
            const history = action.payload;
            state.game = [
                {
                    fen: new Chess().fen(),
                    bestMoves: { status: "set", multiPV: 0, moves: [] },
                    playedMove: null,
                },
            ];

            history.forEach((move, index) => {
                state.game[index].playedMove = {status: "set", move: {move: move.lan, classification: "normal"}};
                const newGame = new Chess(state.game[index].fen);
                newGame.move(move);
                state.game.push({
                    fen: newGame.fen(),
                    bestMoves: { status: "set", multiPV: 0, moves: [] },
                    playedMove: null,
                });
            });

            state.currentMove = state.game.length - 1;
        },
        move: (state, action) => {
            const newGame = new Chess(state.game[state.currentMove].fen);
            newGame.move(action.payload);
            if (
                state.currentMove === state.game.length - 1 ||
                newGame.fen() !== state.game[state.currentMove + 1].fen
            ) {
                state.game = [
                    ...state.game.slice(0, state.currentMove + 1),
                    { fen: newGame.fen(), bestMoves: { status: "set", multiPV: 0, moves: [] }, playedMove: null },
                ];
                let moveStr = action.payload.from + action.payload.to;
                if (action.payload.promotion) moveStr += action.payload.promotion;
                state.game[state.currentMove].playedMove = {status: "set", move: {move: moveStr, classification: "normal"}};
            }
            state.currentMove++;
        },
        setMultiPV: (state, action) => {
            state.multiPV = action.payload;
        },
        setBestMoves: (state, action) => {
            if (action.payload.moveIndex < state.game.length) {
                state.game[action.payload.moveIndex].bestMoves = action.payload;
            }
        },
        setPlayedMove: (state, action) => {
            if (action.payload.move.move && action.payload.moveIndex < state.game.length) {
                state.game[action.payload.moveIndex].playedMove = action.payload;
            }
        },
        goBack: (state) => {
            if (state.currentMove > 0) {
                state.currentMove--;
            }
        },
        goForward: (state) => {
            if (state.currentMove < state.game.length - 1) {
                state.currentMove++;
            }
        },
        goToStart: (state) => {
            state.currentMove = 0;
        },
        goToEnd: (state) => {
            state.currentMove = state.game.length - 1;
        },
        switchBoardOrientation: (state) => {
            state.boardOrientation =
                state.boardOrientation === "white" ? "black" : "white";
        },
        setBoardWidth: (state, action) => {
            state.boardWidth = action.payload;
        },
    },
});

export const {
    setGame,
    move,
    setMultiPV,
    setBestMoves,
    setPlayedMove,
    goBack,
    goForward,
    goToStart,
    goToEnd,
    switchBoardOrientation,
    setBoardWidth,
} = gameSlice.actions;

export default gameSlice.reducer;
