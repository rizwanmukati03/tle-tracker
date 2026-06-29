// components/Layout.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/Layout.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📡" },
  { href: "/collisions", label: "Collision risk", icon: "⚠" },
  { href: "/archive", label: "TLE archive", icon: "📜" },
];

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [criticalSats, setCriticalSats] = useState([]);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/collisions")
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        const crit = json.satellites?.filter(s =>
          s.conjunctions?.some(c => c.risk === "critical")
        ) || [];
        setCriticalSats(crit);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sidebarHeader}>
          <button
            className={styles.hamburgerBtn}
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>
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
            </div>
            <div className={styles.headerCredit}>
              <span className={styles.creditLabel}>Initiated &amp; Developed by</span>
              <span className={styles.creditName}>Rizwan Mukati</span>
            </div>
          </div>
        </header>

        {criticalSats.length > 0 && (
          <div className={styles.criticalBanner}>
            <span className={styles.criticalBannerIcon}>⚠</span>
            {criticalSats.length} satellite{criticalSats.length > 1 ? "s" : ""} at critical collision risk &mdash;{" "}
            {criticalSats.map(s => s.name).join(", ")}
          </div>
        )}

        <main className={styles.content}>{children}</main>

        <footer className={styles.footer}>
          Auto-refreshes every hour &middot; Data sourced from Celestrak &middot; n2yo &middot; SOCRATES &middot; TLE format per USSPACECOM
        </footer>
      </div>
    </div>
  );
}
