import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { getUser } from "../../services/auth/authService";
import styles from "./topbarComponent.module.css";

interface Prop {
  onLogout: () => void;
}

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [{ to: "/dashboard", label: "Dashboard" }];

function TopbarComponent({ onLogout }: Prop) {
  // Letto direttamente da qui (invece che passato come prop) per non dover
  // propagare user/role in ogni pagina che monta TopbarComponent (dashboard,
  // taskList in 5 punti diversi): stesso storage già usato da
  // ProtectedRouteComponent per la stessa decisione.
  const isOwner = getUser()?.role === "owner";
  const { pathname } = useLocation();
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

  const navItems = isOwner
    ? [...NAV_ITEMS, { to: "/employees", label: "Dipendenti" }]
    : NAV_ITEMS;

  return (
    <header className={styles.topbar}>
      <nav className={styles.nav} aria-label="Navigazione principale">
        {navItems.map((item) =>
          pathname === item.to ? (
            <span
              key={item.to}
              className={styles.navItemActive}
              aria-current="page"
            >
              {item.label}
            </span>
          ) : (
            <Link key={item.to} className={styles.navItem} to={item.to}>
              {item.label}
            </Link>
          ),
        )}
      </nav>

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
