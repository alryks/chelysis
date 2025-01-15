import styles from "./App.module.css";

import { Chess } from "chess.js";

import Chessboard from "./components/Chessboard/Chessboard";
import NavBar from "./components/NavBar/NavBar";
import EvalBar from "./components/EvalBar/EvalBar";
import Analysis from "./components/Analysis/Analysis";

import { useDispatch, useSelector } from "react-redux";
import {
    goBack,
    goForward,
    goToEnd,
    goToStart,
    setBoardWidth,
    switchBoardOrientation,
} from "./state/game/gameSlice";
import { startStockfish, stopStockfish } from "./state/analysis/analysisSlice";
import { useEffect, useRef, useState } from "react";

function App() {
    const dispatch = useDispatch();

    const game = useSelector((state) => state.game.game);
    const currentMove = useSelector((state) => state.game.currentMove);
    const boardOrientation = useSelector(
        (state) => state.game.boardOrientation
    );
    const contentRef = useRef(null);

    const stockfishOn = useSelector((state) => state.analysis.stockfishOn);
    const analysisOn = useSelector((state) => state.analysis.analysisOn);

    const [contentHeight, setContentHeight] = useState("100%");
    const [analysisHeight, setAnalysisHeight] = useState("100%");

    function getDimensions(element) {
        const style = window.getComputedStyle(element);
        const paddingV =
            parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const paddingH =
            parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return {
            width: element.clientWidth - paddingH,
            height: element.clientHeight - paddingV,
        };
    }

    function handleResize() {
        if (contentRef.current) {
            const dimensions = getDimensions(contentRef.current);
            if (dimensions.width - 24 <= dimensions.height) {
                dispatch(setBoardWidth(dimensions.width - 24));
                setContentHeight(`${contentRef.current.clientWidth - 24}px`);
                setAnalysisHeight(`${2 * (contentRef.current.clientWidth - 24)}px`);
            } else {
                dispatch(setBoardWidth(dimensions.height));
                setContentHeight("100%");
                setAnalysisHeight("100%");
            }
        }
    }

    useEffect(() => {
        window.addEventListener('resize', handleResize);
        
        // Очистка слушателя при размонтировании компонента
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    useEffect(() => {
        handleResize();
    }, [contentRef]);

    function handleKeyDown(event) {
        if (event.target.tagName === "TEXTAREA") return;

        switch (event.key) {
            case "ArrowLeft":
                if (!analysisOn) {
                    dispatch(goBack());
                }
                break;
            case "ArrowRight":
                if (!analysisOn) {
                    dispatch(goForward());
                }
                break;
            case "ArrowUp":
                if (!analysisOn) {
                    dispatch(goToStart());
                }
                break;
            case "ArrowDown":
                if (!analysisOn) {
                    dispatch(goToEnd());
                }
                break;
            case "x":
                dispatch(switchBoardOrientation());
                break;
            case "s":
                if (analysisOn) return;
                if (stockfishOn) {
                    dispatch(stopStockfish());
                } else {
                    dispatch(startStockfish());
                }
                break;
            default:
                break;
        }
    }

    return (
        <div className={styles.App} onKeyDown={handleKeyDown} tabIndex={0}>
            <NavBar />
            <div
                ref={contentRef}
                className={styles.content}
                style={{ height: contentHeight }}
            >
                <div className={styles.board}>
                    <Chessboard />
                    <EvalBar
                        orientation={boardOrientation}
                        value={
                            game[currentMove].bestMoves.moves.length > 0
                                ? game[currentMove].bestMoves.moves[0]
                                : { score: null, scoreType: null }
                        }
                        turn={new Chess(game[currentMove].fen).turn()}
                    />
                </div>
                <Analysis analysisHeight={analysisHeight} />
            </div>
        </div>
    );
}

export default App;
