let stockfishEngine = null;

export const stockfishService = {
    start() {
        stockfishEngine = new Worker("/stockfish/stockfish.js");
        return stockfishEngine;
    },
    
    terminate() {
        if (stockfishEngine) {
            stockfishEngine.terminate();
            stockfishEngine = null;
        }
    },
    
    postMessage(message) {
        if (stockfishEngine) {
            stockfishEngine.postMessage(message);
        }
    },
    
    setMessageHandler(handler) {
        if (stockfishEngine) {
            stockfishEngine.onmessage = handler;
        }
    },
    
    setErrorHandler(handler) {
        if (stockfishEngine) {
            stockfishEngine.onerror = handler;
        }
    }
};