import { configureStore } from "@reduxjs/toolkit";
import gameReducer from "./game/gameSlice";
import analysisReducer from "./analysis/analysisSlice";

export const store = configureStore({
    reducer: {
        game: gameReducer,
        analysis: analysisReducer,
    },
});