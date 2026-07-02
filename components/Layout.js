// components/Layout.js
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/Layout.module.css";

// ── Developer credit ─────────────────────────────────────────────────────────
// show: false  →  hides ALL locations instantly (master switch)
// showHeader   →  plain text top-right of the page header
// showSidebar  →  pinned to the bottom of the left navigation
// showFooter   →  right side of the page footer
const DEV_CREDIT = {
  show:        true,
  showHeader:  false,
  showSidebar: true,
  showFooter:  true,
  label: "Initiated & Developed by ",
  name:  "Rizwan Mukati",
};
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/",           label: "Dashboard",     icon: "📡" },
  { href: "/collisions", label: "Collision risk", icon: "⚠"  },
  { href: "/archive",    label: "TLE archive",   icon: "📜" },
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (window.innerWidth < 700) setOpen(false);
  }, []);

  useEffect(() => {
    if (window.innerWidth < 700) setOpen(false);
  }, [router.pathname]);

  const toggle = useCallback(() => setOpen(o => !o), []);

  return (
    <div className={styles.shell}>

      {/* Mobile-only sticky top bar */}
      <div className={styles.mobileTopBar}>
        <button className={styles.mobileHamburgerBtn} onClick={toggle} aria-label="Toggle menu">
          ☰
        </button>
        <span className={styles.mobileLogoText}>LEO Tracker</span>
      </div>

      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarHeader}>
          <button
            className={styles.hamburgerBtn}
            onClick={toggle}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            ☰
          </button>
          <span className={styles.logoText}>LEO Tracker</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${router.pathname === item.href ? styles.navItemActive : ""}`}
              title={!open ? item.label : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Sidebar credit — pinned at bottom, always visible without scrolling */}
        {DEV_CREDIT.show && DEV_CREDIT.showSidebar && (
          <div className={styles.sidebarCredit}>
            <span className={styles.sidebarCreditLabel}>{DEV_CREDIT.label}</span>
            <span className={styles.sidebarCreditName}>{DEV_CREDIT.name}</span>
          </div>
        )}
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.orbit} aria-hidden="true">
              <div className={styles.orbitRing} />
              <div className={styles.orbitDot} />
            </div>
            <div className={styles.headerText}>
              <h1 className={styles.title}>LEO Asset Tracker</h1>
              <p className={styles.subtitle}>Live TLE Data &middot; Orbital Elements Tracker</p>
              {/* Header credit — sits under the subtitle as a third text line, no box */}
              {DEV_CREDIT.show && DEV_CREDIT.showHeader && (
                <p className={styles.headerCreditInline}>
                  <span className={styles.headerCreditLabel}>{DEV_CREDIT.label}</span>
                  {" "}
                  <span className={styles.headerCreditName}>{DEV_CREDIT.name}</span>
                </p>
              )}
            </div>
          </div>
        </header>

        <main className={styles.content}>{children}</main>

        <footer className={styles.footer}>
          <span className={styles.footerLeft}>
            Auto-refreshes every hour &middot; Celestrak &middot; n2yo &middot; SOCRATES &middot; TLE format per USSPACECOM
          </span>
          {DEV_CREDIT.show && DEV_CREDIT.showFooter && (
            <span className={styles.footerCredit}>
              {DEV_CREDIT.label}{" "}
              <strong className={styles.footerCreditName}>{DEV_CREDIT.name}</strong>
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
