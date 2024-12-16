import { useEffect, useRef } from "react";

export function useTimes(callback, dependencies, times) {
    const countRef = useRef(0);

    useEffect(() => {
        if (countRef.current < times) {
            callback();
            countRef.current += 1;
        }
    }, dependencies);
}
