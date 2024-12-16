import "./Logo.css";
import { ReactComponent as LogoSVG } from "../../../assets/logo.svg";

function Logo() {
    return (
        <div className="logo">
            <LogoSVG />
        </div>
    );
}

export default Logo;
