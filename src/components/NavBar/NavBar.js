import styles from "./NavBar.module.css";
import Logo from "./Logo/Logo";

function NavBar() {
    return (
        <header className={styles.header}>
            <Logo />
            <div className={styles.blur}></div>
        </header>
    );
}

export default NavBar;
