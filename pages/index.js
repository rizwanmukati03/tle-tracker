// pages/index.js
import { useState, useCallback, useEffect, useRef } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";

const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

function formatEpoch(tleLines) {
  try {
    const line1 = tleLines?.line1 || "";
    const epochStr = line1.substring(18, 32).trim();
    if (!epochStr) return null;
    const year2 = parseInt(epochStr.substring(0, 2));
    const day = parseFloat(epochStr.substring(2));
    const year = year2 >= 57 ? 1900 + year2 : 2000 + year2;
    const date = new Date(Date.UTC(year, 0, 1));
    date.setUTCDate(date.getUTCDate() + Math.floor(day) - 1);
    const frac = day - Math.floor(day);
    date.setUTCMilliseconds(frac * 86400000);
    return date.toUTCString().replace("GMT", "UTC");
  } catch {
    return null;
  }
}

function formatCountdown(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const SAT_LABELS = {
  62726: "EO1", 67748: "EO2", 68835: "EO3",
  65055: "S1",  66054: "HS",  43530: "PRSS-1", 43529: "PAKTES",
};

function SatelliteCard({ sat }) {
  const [copied, setCopied] = useState(false);

  const tleFull = sat.line1 && sat.line2
    ? `${sat.name || `NORAD-${sat.norad}`}\n${sat.line1}\n${sat.line2}`
    : null;

  const handleCopy = async () => {
    if (!tleFull) return;
    await navigator.clipboard.writeText(tleFull);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!tleFull) return;
    const blob = new Blob([tleFull], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sat.norad}.tle`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const epoch = formatEpoch(sat);
  const label = SAT_LABELS[sat.norad] || sat.name;

  return (
    <div className={`${styles.card} ${sat.error ? styles.cardError : ""} ${sat.stale ? styles.cardStale : ""}`}>
      <div className={styles.cardHeader}>
        <div className={styles.satLabel}>
          <span className={styles.badge}>{label}</span>
          <span className={styles.satName}>{sat.name || `NORAD ${sat.norad}`}</span>
        </div>
        <span className={styles.noradTag}>NORAD {sat.norad}</span>
      </div>

      {sat.error ? (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}>⚠</span>
          <span>{sat.error}</span>
        </div>
      ) : (
        <>
          <div className={styles.tleBlock}>
            <div className={styles.tleLine}>
              <span className={styles.lineTag}>L1</span>
              <code>{sat.line1}</code>
            </div>
            <div className={styles.tleLine}>
              <span className={styles.lineTag}>L2</span>
              <code>{sat.line2}</code>
            </div>
          </div>

          {epoch && (
            <div className={styles.epochRow}>
              <span className={styles.epochLabel}>Epoch</span>
              <span className={styles.epochValue}>{epoch}</span>
            </div>
          )}

          <div className={styles.metaRow}>
            <span className={styles.sourceTag}>via {sat.source}</span>
            {sat.fromCache && !sat.stale && <span className={styles.cacheTag}>cached</span>}
            {sat.stale && <span className={styles.staleTag}>stale — fetch failed</span>}
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={handleCopy}>
              {copied ? "✓ Copied" : "Copy TLE"}
            </button>
            <button className={styles.btnPrimary} onClick={handleDownload}>
              ↓ Download .tle
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS / 1000);
  const [cooldownMsg, setCooldownMsg] = useState(null);
  const autoRefreshTimer = useRef(null);
  const countdownTimer = useRef(null);

  const fetchAll = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setCooldownMsg(null);
    try {
      const url = force ? "/api/tle?force=true" : "/api/tle";
      const res = await fetch(url);
      const json = await res.json();

      if (res.status === 429) {
        setCooldownMsg(json.error);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      setData(json);
      setLastFetched(new Date());
      // Reset countdown
      setCountdown(AUTO_REFRESH_MS / 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on page load
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 1 hour
  useEffect(() => {
    autoRefreshTimer.current = setInterval(() => {
      fetchAll(false);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(autoRefreshTimer.current);
  }, [fetchAll]);

  // Countdown timer — ticks every second
  useEffect(() => {
    countdownTimer.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return AUTO_REFRESH_MS / 1000;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownTimer.current);
  }, []);

  const handleDownloadAll = () => {
    if (!data?.satellites) return;
    const content = data.satellites
      .filter(s => s.line1 && s.line2)
      .map(s => `${s.name || `NORAD-${s.norad}`}\n${s.line1}\n${s.line2}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leo_asset_tracker.tle";
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = data?.satellites?.filter(s => s.line1).length || 0;

  return (
    <>
      <Head>
        <title>LEO Asset Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Live TLE data and orbital tracking for LEO satellite assets" />
      </Head>

      <div className={styles.root}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.orbit} aria-hidden="true">
              <div className={styles.orbitRing} />
              <div className={styles.orbitDot} />
            </div>
            <div className={styles.headerText}>
              <h1 className={styles.title}>LEO Asset Tracker</h1>
              <p className={styles.subtitle}>
                Live TLE Data · Orbital Elements Tracker
              </p>
            </div>
            <div className={styles.headerCredit}>
              <span className={styles.creditLabel}>Initiated &amp; Developed by</span>
              <span className={styles.creditName}>Manager Rizwan Mukati</span>

            </div>
          </div>
        </header>

        {/* Stats bar */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>7</span>
            <span className={styles.statLabel}>Total Satellites</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>{loading ? "—" : successCount}</span>
            <span className={styles.statLabel}>TLEs Loaded</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>LEO</span>
            <span className={styles.statLabel}>Orbit Class</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              {lastFetched
                ? lastFetched.toUTCString().replace("GMT", "UTC").slice(0, 22)
                : "—"}
            </span>
            <span className={styles.statLabel}>Data Fetched At (UTC)</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={`${styles.statValue} ${styles.countdown}`}>
              {loading ? "Fetching…" : formatCountdown(countdown)}
            </span>
            <span className={styles.statLabel}>Next Auto-Refresh</span>
          </div>
        </div>

        <main className={styles.main}>
          {error && (
            <div className={styles.globalError}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {cooldownMsg && (
            <div className={styles.cooldownMsg}>
              ⏱ {cooldownMsg}
            </div>
          )}

          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.loadingOrbit}>
                <div className={styles.loadingRing} />
                <div className={styles.loadingDot} />
              </div>
              <p>Fetching orbital elements from Celestrak…</p>
            </div>
          )}

          {!loading && data?.satellites && (
            <>
              <div className={styles.grid}>
                {data.satellites.map(sat => (
                  <SatelliteCard key={sat.norad} sat={sat} />
                ))}
              </div>

              <div className={styles.bottomBar}>
                <button
                  className={styles.fetchBtn}
                  onClick={() => fetchAll(true)}
                  disabled={loading}
                >
                  ⟳ Refresh TLE Data
                </button>
                <button className={styles.btnDownloadAll} onClick={handleDownloadAll}>
                  ↓ Download All (.tle)
                </button>
              </div>
            </>
          )}
        </main>

        <footer className={styles.footer}>
          Auto-refreshes every hour · Data sourced from Celestrak · n2yo · TLE format per USSPACECOM
        </footer>
      </div>
    </>
  );
}
