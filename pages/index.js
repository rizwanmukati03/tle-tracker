// pages/index.js
import { useState, useCallback, useEffect, useRef } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";

const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours
const COLLISION_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

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

const RISK_LABELS = { critical: "Critical", warning: "Warning", watch: "Watch" };

function ProximityGauge({ minRangeKm, risk }) {
  const pct = Math.min(Math.max(minRangeKm, 0) / 5, 1) * 100;
  return (
    <div className={styles.gaugeWrap}>
      <div className={styles.gaugeTrack}>
        <div className={styles.gaugeZoneCritical} />
        <div className={styles.gaugeZoneWarning} />
        <div className={styles.gaugeZoneWatch} />
        <div
          className={`${styles.gaugeMarker} ${styles["gaugeMarker_" + risk]}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className={styles.gaugeScale}>
        <span className={styles.gaugeTickFirst}>0</span>
        <span className={styles.gaugeTick} style={{ left: "20%" }}>1</span>
        <span className={styles.gaugeTick} style={{ left: "60%" }}>3</span>
        <span className={styles.gaugeTickLast}>5 km</span>
      </div>
    </div>
  );
}

function probabilityTier(maxProb) {
  if (maxProb == null) return null;
  if (maxProb >= 1e-4) return "high";
  if (maxProb >= 1e-5) return "elevated";
  if (maxProb >= 1e-6) return "moderate";
  return "low";
}

const PROB_TIER_LABELS = { low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High" };

function ProbabilityGauge({ maxProb }) {
  if (maxProb == null) {
    return (
      <div className={styles.probGaugeWrap}>
        <div className={styles.probGaugeLabelRow}>
          <span className={styles.fieldLabel}>Collision probability</span>
          <span className={styles.probNoData}>No data — object size unknown</span>
        </div>
      </div>
    );
  }

  const tier = probabilityTier(maxProb);
  const clamped = Math.min(Math.max(maxProb, 1e-7), 1e-3);
  const pct = ((Math.log10(clamped) + 7) / 4) * 100;

  return (
    <div className={styles.probGaugeWrap}>
      <div className={styles.probGaugeLabelRow}>
        <span className={styles.fieldLabel}>Collision probability</span>
        <span className={`${styles.probValue} ${styles["probValue_" + tier]}`}>
          {maxProb.toExponential(2)} · {PROB_TIER_LABELS[tier]}
        </span>
      </div>
      <div className={styles.probGaugeTrack}>
        <div className={styles.probZoneLow} />
        <div className={styles.probZoneModerate} />
        <div className={styles.probZoneElevated} />
        <div className={styles.probZoneHigh} />
        <div className={`${styles.probMarker} ${styles["probMarker_" + tier]}`} style={{ left: `${pct}%` }} />
      </div>
      <div className={styles.probCaveat}>⚠ Unreliable for small or unknown-size objects</div>
    </div>
  );
}

function ConjunctionRow({ c }) {
  const badgeCls = {
    critical: styles.riskCritical,
    warning: styles.riskWarning,
    watch: styles.riskWatch,
  }[c.risk];
  const distCls = {
    critical: styles.distCritical,
    warning: styles.distWarning,
    watch: styles.distWatch,
  }[c.risk];

  return (
    <div className={`${styles.conjunctionCard} ${styles["conj_" + c.risk]}`}>
      <span className={badgeCls}>● {RISK_LABELS[c.risk]}</span>

      <div className={styles.conjunctionFields}>
        <div>
          <div className={styles.fieldLabel}>Miss distance</div>
          <div className={`${styles.fieldValueLg} ${distCls}`}>{c.minRangeKm.toFixed(2)} km</div>
        </div>
        <div>
          <div className={styles.fieldLabel}>TCA (closest approach)</div>
          <div className={styles.fieldValueMd}>{c.tca} UTC</div>
        </div>
      </div>

      <ProximityGauge minRangeKm={c.minRangeKm} risk={c.risk} />

      <ProbabilityGauge maxProb={c.maxProb} />

      <div className={styles.conjunctionTarget}>
        vs {c.otherName}{" "}
        {c.otherStatus && <span className={styles.statusTag}>[{c.otherStatus}]</span>} · NORAD {c.otherNorad}
      </div>

      <div className={styles.conjunctionMeta}>
        <span>Relative speed: {Number.isFinite(c.relSpeedKmS) ? c.relSpeedKmS.toFixed(2) : "—"} km/s</span>
        <span>Data age: {Number.isFinite(c.dse) ? c.dse.toFixed(1) : "—"} days</span>
      </div>
    </div>
  );
}

function CollisionSection({ norad, data }) {
  const reportUrl = `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=10`;
  const conjunctions = data?.conjunctions || [];
  const sorted = [...conjunctions].sort((a, b) => a.minRangeKm - b.minRangeKm);
  const top = sorted.slice(0, 2);
  const extraCount = sorted.length - top.length;

  return (
    <div className={styles.collisionSection}>
      <div className={styles.collisionHeader}>
        <span className={styles.collisionLabel}>◎ Collision risk</span>
        {!data?.error && (
          <span className={styles.collisionCount}>
            · {conjunctions.length} conjunction{conjunctions.length === 1 ? "" : "s"} in next 7 days
          </span>
        )}
        {data?.stale && <span className={styles.staleTagSmall}>stale</span>}
      </div>

      {data?.error && <div className={styles.collisionError}>Unable to fetch: {data.error}</div>}
      {!data?.error && conjunctions.length === 0 && (
        <div className={styles.collisionNone}>No conjunctions within 5 km threshold</div>
      )}

      {top.map((c, i) => <ConjunctionRow key={i} c={c} />)}

      {extraCount > 0 && (
        <div className={styles.moreNote}>+ {extraCount} more conjunction{extraCount === 1 ? "" : "s"} in full report</div>
      )}

      <a href={reportUrl} target="_blank" rel="noreferrer" className={styles.viewReportLink}>
        View full SOCRATES report ↗
      </a>
    </div>
  );
}

function formatArchiveDate(ms) {
  return new Date(ms).toUTCString().replace("GMT", "UTC");
}

function ArchivePanel({ norad }) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [results, setResults] = useState(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveErr, setArchiveErr] = useState(null);

  const handleSearch = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveErr(null);
    try {
      let url = `/api/archive?norad=${norad}&limit=50`;
      if (fromDate) url += `&from=${new Date(fromDate + "T00:00:00Z").getTime()}`;
      if (toDate) url += `&to=${new Date(toDate + "T23:59:59Z").getTime()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch archive");
      setResults(json.entries);
      setVisibleCount(5);
    } catch (e) {
      setArchiveErr(e.message);
    } finally {
      setArchiveLoading(false);
    }
  }, [norad, fromDate, toDate]);

  useEffect(() => {
    if (open && results === null) {
      handleSearch();
    }
  }, [open, results, handleSearch]);

  const visibleResults = results ? results.slice(0, visibleCount) : [];
  const remaining = results ? results.length - visibleCount : 0;

  return (
    <div className={styles.archiveSection}>
      <button className={styles.archiveToggle} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} 📜 TLE Archive
      </button>

      {open && (
        <div className={styles.archiveBody}>
          <div className={styles.archiveFilters}>
            <label className={styles.archiveLabel}>
              From
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className={styles.archiveDateInput}
              />
            </label>
            <label className={styles.archiveLabel}>
              To
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className={styles.archiveDateInput}
              />
            </label>
            <button className={styles.archiveSearchBtn} onClick={handleSearch} disabled={archiveLoading}>
              {archiveLoading ? "Searching…" : "Search"}
            </button>
          </div>

          {archiveErr && <div className={styles.archiveError}>{archiveErr}</div>}

          {results && results.length === 0 && !archiveLoading && (
            <div className={styles.archiveEmpty}>No archived entries in this range.</div>
          )}

          {results && results.length > 0 && (
            <>
              <div className={styles.archiveList}>
                {visibleResults.map((entry, i) => (
                  <div key={i} className={styles.archiveEntry}>
                    <div className={styles.archiveEntryHeader}>
                      <span className={styles.archiveEntryDate}>{formatArchiveDate(entry.epochMs ?? entry.fetchedAt)}</span>
                      <span className={styles.archiveEntrySource}>via {entry.source}</span>
                    </div>
                    <div className={styles.archiveEntryTle}>
                      <code>{entry.line1}</code>
                      <code>{entry.line2}</code>
                    </div>
                    <div className={styles.archiveEntryCaptured}>captured {formatArchiveDate(entry.fetchedAt)}</div>
                  </div>
                ))}
              </div>

              {remaining > 0 && (
                <button
                  className={styles.archiveLoadMoreBtn}
                  onClick={() => setVisibleCount(v => v + 5)}
                >
                  Show {Math.min(5, remaining)} more ({remaining} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
            {!sat.fromCache && sat.tleChanged === true && <span className={styles.updatedTag}>🔄 Updated</span>}
            {!sat.fromCache && sat.tleChanged === false && <span className={styles.noChangeTag}>No change</span>}
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

      {sat.collisions && <CollisionSection norad={sat.norad} data={sat.collisions} />}
      <ArchivePanel norad={sat.norad} />
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
  const [collisionData, setCollisionData] = useState(null);
  const autoRefreshTimer = useRef(null);
  const countdownTimer = useRef(null);
  const collisionTimer = useRef(null);

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
      setCountdown(AUTO_REFRESH_MS / 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollisions = useCallback(async (force = false) => {
    try {
      const url = force ? "/api/collisions?force=true" : "/api/collisions";
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) setCollisionData(json);
    } catch {
      // fail silently — TLE data still works without this
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchCollisions();
  }, [fetchAll, fetchCollisions]);

  useEffect(() => {
    autoRefreshTimer.current = setInterval(() => {
      fetchAll(false);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(autoRefreshTimer.current);
  }, [fetchAll]);

  useEffect(() => {
    collisionTimer.current = setInterval(() => {
      fetchCollisions(false);
    }, COLLISION_REFRESH_MS);
    return () => clearInterval(collisionTimer.current);
  }, [fetchCollisions]);

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

  const criticalSats = collisionData?.satellites?.filter(s =>
    s.conjunctions?.some(c => c.risk === "critical")
  ) || [];

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
              <span className={styles.creditName}>Rizwan Mukati</span>
            </div>
          </div>
        </header>

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

        {criticalSats.length > 0 && (
          <div className={styles.criticalBanner}>
            <span className={styles.criticalBannerIcon}>⚠</span>
            {criticalSats.length} satellite{criticalSats.length > 1 ? "s" : ""} at critical collision risk —{" "}
            {criticalSats.map(s => s.name).join(", ")}
          </div>
        )}

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
                {data.satellites.map(sat => {
                  const collisionMatch = collisionData?.satellites?.find(c => c.norad === sat.norad);
                  return (
                    <SatelliteCard
                      key={sat.norad}
                      sat={{ ...sat, collisions: collisionMatch }}
                    />
                  );
                })}
              </div>

              <div className={styles.bottomBar}>
                <button
                  className={styles.fetchBtn}
                  onClick={() => { fetchAll(true); fetchCollisions(true); }}
                  disabled={loading}
                >
                  ⟳ Refresh All Data
                </button>
                <button className={styles.btnDownloadAll} onClick={handleDownloadAll}>
                  ↓ Download All (.tle)
                </button>
              </div>
            </>
          )}
        </main>

        <footer className={styles.footer}>
          Auto-refreshes every hour · Data sourced from Celestrak · n2yo · SOCRATES · TLE format per USSPACECOM
        </footer>
      </div>
    </>
  );
}
