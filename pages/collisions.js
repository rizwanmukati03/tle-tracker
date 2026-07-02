// pages/collisions.js
import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import styles from "../styles/Collisions.module.css";
import { SAT_LABELS } from "../lib/satellites";

const RISK_LABELS = { critical: "Critical", warning: "Warning", watch: "Watch" };

function probabilityTier(maxProb) {
  if (maxProb == null) return null;
  if (maxProb >= 1e-4) return "high";
  if (maxProb >= 1e-5) return "elevated";
  if (maxProb >= 1e-6) return "moderate";
  return "low";
}

const PROB_TIER_LABELS = { low: "Low", moderate: "Moderate", elevated: "Elevated", high: "High" };

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

function SatelliteCollisionCard({ sat, customName }) {
  const reportUrl = `https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${sat.norad}&ORDER=MINRANGE&MAX=10`;
  const conjunctions = sat.conjunctions || [];
  const sorted = [...conjunctions].sort((a, b) => a.minRangeKm - b.minRangeKm);
  const top = sorted.slice(0, 5);
  const extraCount = sorted.length - top.length;
  const label = SAT_LABELS[sat.norad] || sat.name;
  const displayName = customName || sat.name;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.satLabel}>
          <span className={styles.badge}>{label}</span>
          <span className={styles.satName}>{displayName}</span>
        </div>
        <span className={styles.noradTag}>NORAD {sat.norad}</span>
      </div>

      {sat.error && <div className={styles.collisionError}>Unable to fetch: {sat.error}</div>}
      {!sat.error && conjunctions.length === 0 && (
        <div className={styles.collisionNone}>No conjunctions within 5 km threshold</div>
      )}
      {!sat.error && conjunctions.length > 0 && (
        <div className={styles.collisionCount}>
          {conjunctions.length} conjunction{conjunctions.length === 1 ? "" : "s"} in next 7 days
        </div>
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

export default function CollisionsPage() {
  const [collisionData, setCollisionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customNames, setCustomNames] = useState({});

  // Read custom names set on the Dashboard
  useEffect(() => {
    try {
      const stored = localStorage.getItem("leo_satellite_names");
      if (stored) setCustomNames(JSON.parse(stored));
    } catch {}
  }, []);

  const fetchCollisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/collisions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch collision data");
      setCollisionData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollisions();
  }, [fetchCollisions]);

  const criticalSats = collisionData?.satellites?.filter(s =>
    s.conjunctions?.some(c => c.risk === "critical")
  ) || [];

  return (
    <>
      <Head>
        <title>Collision Risk — LEO Asset Tracker</title>
      </Head>

      {criticalSats.length > 0 && (
        <div className={styles.criticalBanner}>
          <span className={styles.criticalBannerIcon}>⚠</span>
          {criticalSats.length} satellite{criticalSats.length > 1 ? "s" : ""} at critical collision risk &mdash;{" "}
          {criticalSats.map(s => s.name).join(", ")}
        </div>
      )}

      <h2 className={styles.pageTitle}>◎ Collision risk</h2>
      <p className={styles.pageSubtitle}>
        Top 5 closest conjunctions per satellite over the next 7 days. Refresh on the Dashboard to update.
      </p>

      {error && <div className={styles.globalError}><strong>Error:</strong> {error}</div>}
      {loading && <div className={styles.loadingState}>Fetching conjunction data from SOCRATES…</div>}

      {!loading && collisionData?.satellites && (
        <div className={styles.grid}>
          {collisionData.satellites.map(sat => (
            <SatelliteCollisionCard key={sat.norad} sat={sat} customName={customNames[sat.norad]} />
          ))}
        </div>
      )}
    </>
  );
}
