import styles from './MoveIndicator.module.css';
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

const classificationIcons = {
    brilliant: Brilliant,
    greatFind: GreatFind,
    best: Best,
    excellent: Excellent,
    good: Good,
    book: Book,
    inaccuracy: Inaccuracy,
    mistake: Mistake,
    miss: Miss,
    blunder: Blunder,
    forced: Forced,
};

export function MoveIndicator({ classification, square, boardOrientation, width }) { // classification = brilliant, square = h1
    if (!classification) return null;

    let left = parseInt(square[0].charCodeAt(0) - 97);
    let top = 7 - (parseInt(square[1]) - 1);
    if (boardOrientation === "black") {
        left = 7 - left;
        top = 7 - top;
    }
    left += 1
    left *= width / 8;
    top *= width / 8;
    
    const Icon = classificationIcons[classification];
    return (
        <div className={`${styles.indicator} ${styles[classification]}`} style={{ left: left, top: top }}>
            <Icon className={styles.icon} />
        </div>
    );
} 