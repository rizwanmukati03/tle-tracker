// pages/index.js
import { useState, useCallback } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";

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

const SAT_LABELS = {
  62726: "EO1", 67748: "EO2", 68835: "EO3",
  65055: "S1",  66054: "HS",  43530: "PRSS-1",
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
    <div className={`${styles.card} ${sat.error ? styles.cardError : ""}`}>
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
            {sat.fromCache && <span className={styles.cacheTag}>cached</span>}
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tle");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadAll = () => {
    if (!data?.satellites) return;
    const content = data.satellites
      .filter((s) => s.line1 && s.line2)
      .map((s) => `${s.name || `NORAD-${s.norad}`}\n${s.line1}\n${s.line2}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suparco_leo_assets.tle";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head>
        <title>SUPARCO LEO Assets — TLE Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Live TLE data for SUPARCO LEO satellite assets" />
      </Head>

      <div className={styles.root}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.orbit} aria-hidden="true">
              <div className={styles.orbitRing} />
              <div className={styles.orbitDot} />
            </div>
            <div>
              <h1 className={styles.title}>SUPARCO LEO Assets</h1>
              <p className={styles.subtitle}>
                TLE Tracker · Pakistan Space & Upper Atmosphere Research Commission
              </p>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.controls}>
            <button
              className={styles.fetchBtn}
              onClick={fetchAll}
              disabled={loading}
            >
              {loading ? (
                <><span className={styles.spinner} /> Fetching…</>
              ) : (
                "⟳ Fetch Latest TLE"
              )}
            </button>

            {lastFetched && (
              <span className={styles.timestamp}>
                Last fetched: {lastFetched.toUTCString().replace("GMT", "UTC")}
              </span>
            )}
          </div>

          {error && (
            <div className={styles.globalError}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {!data && !loading && !error && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🛰</div>
              <p>Click <strong>Fetch Latest TLE</strong> to retrieve orbital elements for all satellites.</p>
            </div>
          )}

          {data?.satellites && (
            <>
              <div className={styles.grid}>
                {data.satellites.map((sat) => (
                  <SatelliteCard key={sat.norad} sat={sat} />
                ))}
              </div>

              <div className={styles.downloadAll}>
                <button className={styles.btnDownloadAll} onClick={handleDownloadAll}>
                  ↓ Download All Satellites (.tle)
                </button>
              </div>
            </>
          )}
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerCredit}>Developed by Rizwan </div>
          <div>Data sourced from Celestrak · Space-Track · n2yo &nbsp;·&nbsp; TLE format per USSPACECOM</div>
        </footer>
      </div>
    </>
  );
}
