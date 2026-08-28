import { useEffect, useId, useRef, useState } from "react";
import styles from "./topbarComponent.module.css";

interface Prop {
  onLogout: () => void;
}

function TopbarComponent({ onLogout }: Prop) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const logoutItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    logoutItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        accountButtonRef.current?.focus();
      } else if (event.key === "Tab") {
        // Con un solo item il focus è già sull'unica voce: se l'utente esce
        // con Tab il menu deve chiudersi, altrimenti resta aperto e "orfano"
        // mentre il focus prosegue altrove nella pagina.
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  function handleLogoutClick() {
    setIsMenuOpen(false);
    onLogout();
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.side} aria-hidden="true" />

      <span className={styles.logo}>
        <span className={styles.logoMark}>H</span>odum
      </span>

      <div className={styles.accountArea} ref={containerRef}>
        <button
          ref={accountButtonRef}
          type="button"
          className={styles.accountButton}
          aria-label="Menu account"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <svg
            className={styles.accountIcon}
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 20c0-4.14 3.36-6.5 7.5-6.5s7.5 2.36 7.5 6.5" />
          </svg>
        </button>

        {isMenuOpen && (
          <div id={menuId} role="menu" className={styles.menu}>
            <button
              ref={logoutItemRef}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleLogoutClick}
            >
              Disconnetti
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopbarComponent;
