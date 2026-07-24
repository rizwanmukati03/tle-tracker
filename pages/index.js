// pages/index.js
import { useState, useCallback, useEffect, useRef } from "react";
import Head from "next/head";
import styles from "../styles/Home.module.css";
import { SAT_LABELS } from "../lib/satellites";

const AUTO_REFRESH_MS = 4 * 60 * 60 * 1000;

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
  } catch { return null; }
}

function formatCountdown(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Reusable dropdown download button ──
function DownloadMenu({ onSelect, variant = "solid" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.downloadWrapper} ref={wrapRef}>
      <button
        className={variant === "outline" ? styles.btnDownloadOutline : styles.btnDownloadSolid}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        ↓ Download <span className={styles.menuChevron}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={`${styles.downloadMenu} ${variant === "outline" ? styles.downloadMenuUp : ""}`}>
          <button className={styles.downloadMenuItem} onClick={() => { onSelect("tle"); setOpen(false); }}>
            <span className={styles.menuExt}>.tle</span>
            <span className={styles.menuLabel}>TLE format</span>
          </button>
          <button className={styles.downloadMenuItem} onClick={() => { onSelect("txt"); setOpen(false); }}>
            <span className={styles.menuExt}>.txt</span>
            <span className={styles.menuLabel}>Text format</span>
          </button>
          <div className={styles.menuDivider} />
          <button className={`${styles.downloadMenuItem} ${styles.downloadMenuBoth}`} onClick={() => { onSelect("both"); setOpen(false); }}>
            ↓ &nbsp;Download both formats
          </button>
        </div>
      )}
    </div>
  );
}

// ── Satellite card ──
function SatelliteCard({ sat, customName, onRename }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const displayName = customName || sat.name || `NORAD-${sat.norad}`;
  const label = SAT_LABELS[sat.norad] || sat.name;
  const epoch = formatEpoch(sat);

  // Copy: no satellite name
  const handleCopy = async () => {
    if (!sat.line1 || !sat.line2) return;
    await navigator.clipboard.writeText(`${sat.line1}\n${sat.line2}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download: with satellite name
  const handleDownload = (format) => {
    if (!sat.line1 || !sat.line2) return;
    const content = `${displayName}\n${sat.line1}\n${sat.line2}`;
    const base = sat.norad;
    const dl = (ext) => triggerDownload(`${base}.${ext}`, content);
    if (format === "tle") dl("tle");
    else if (format === "txt") dl("txt");
    else { dl("tle"); setTimeout(() => dl("txt"), 300); }
  };

  const startEdit = () => { setEditValue(displayName); setEditing(true); };
  const saveEdit = () => {
    const trimmed = editValue.trim();
    onRename(sat.norad, trimmed || null);
    setEditing(false);
  };
  const cancelEdit = () => setEditing(false);

  return (
    <div className={`${styles.card} ${sat.error ? styles.cardError : ""} ${sat.stale ? styles.cardStale : ""}`}>
      <div className={styles.cardHeader}>
        <div className={styles.satLabel}>
          <span className={styles.badge}>{label}</span>
          {editing ? (
            <div className={styles.nameEditRow}>
              <input
                className={styles.nameInput}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                autoFocus
                maxLength={40}
              />
              <button className={styles.nameEditSave} onClick={saveEdit} title="Save">✓</button>
              <button className={styles.nameEditCancel} onClick={cancelEdit} title="Cancel">✕</button>
            </div>
          ) : (
            <span className={styles.satNameWrap}>
              <span className={styles.satName}>{displayName}</span>
              <button className={styles.pencilBtn} onClick={startEdit} title="Edit satellite name">✎</button>
            </span>
          )}
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
            <div className={styles.tleLine}><code>{sat.line1}</code></div>
            <div className={styles.tleLine}><code>{sat.line2}</code></div>
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
            <DownloadMenu onSelect={handleDownload} variant="solid" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──
export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS / 1000);
  const [cooldownMsg, setCooldownMsg] = useState(null);
  const [customNames, setCustomNames] = useState({});

  // Load custom satellite names from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("leo_satellite_names");
      if (stored) setCustomNames(JSON.parse(stored));
    } catch {}
  }, []);

  const handleRename = (norad, name) => {
    setCustomNames(prev => {
      const updated = { ...prev };
      if (name) updated[norad] = name;
      else delete updated[norad];
      try { localStorage.setItem("leo_satellite_names", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Refs so timer callbacks always have fresh function references
  const countdownRef = useRef(AUTO_REFRESH_MS / 1000);
  const refreshRef = useRef(null);

  const fetchAll = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    setCooldownMsg(null);
    try {
      const url = force ? "/api/tle?force=true" : "/api/tle";
      const res = await fetch(url);
      const json = await res.json();
      if (res.status === 429) { setCooldownMsg(json.error); return; }
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      setData(json);
      setLastFetched(new Date());
      // Seed countdown from real Redis TTL reported by server
      const ttl = typeof json.cacheExpiresInSeconds === "number"
        ? json.cacheExpiresInSeconds
        : AUTO_REFRESH_MS / 1000;
      countdownRef.current = ttl;
      setCountdown(ttl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEverything = useCallback((force) => {
    fetchAll(force);
    fetch(force ? "/api/collisions?force=true" : "/api/collisions").catch(() => {});
  }, [fetchAll]);

  // Keep ref current
  useEffect(() => { refreshRef.current = refreshEverything; }, [refreshEverything]);

  // Initial fetch
  useEffect(() => { refreshEverything(false); }, [refreshEverything]);

  // SINGLE countdown timer that also drives the auto-refresh.
  // Replacing the old separate 6-hour interval which could drift and
  // be throttled by the browser in background tabs.
  useEffect(() => {
    const tick = setInterval(() => {
      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        countdownRef.current = AUTO_REFRESH_MS / 1000;
        refreshRef.current?.(false);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []); // Empty deps — intentional; uses refs to stay current

  // Visibility change handler — catches up after browser throttles
  // the timer while the tab is in the background.
  useEffect(() => {
    let hiddenAt = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        const elapsedSec = (Date.now() - hiddenAt) / 1000;
        hiddenAt = null;
        const remaining = countdownRef.current - elapsedSec;
        if (remaining <= 0) {
          countdownRef.current = AUTO_REFRESH_MS / 1000;
          setCountdown(countdownRef.current);
          refreshRef.current?.(false);
        } else {
          countdownRef.current = Math.round(remaining);
          setCountdown(countdownRef.current);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const handleDownloadAll = (format) => {
    if (!data?.satellites) return;
    const content = data.satellites
      .filter(s => s.line1 && s.line2)
      .map(s => `${customNames[s.norad] || s.name || `NORAD-${s.norad}`}\n${s.line1}\n${s.line2}`)
      .join("\n");
    const dl = (ext) => triggerDownload(`leo_asset_tracker.${ext}`, content);
    if (format === "tle") dl("tle");
    else if (format === "txt") dl("txt");
    else { dl("tle"); setTimeout(() => dl("txt"), 300); }
  };

  const successCount = data?.satellites?.filter(s => s.line1).length || 0;

  return (
    <>
      <Head>
        <title>Dashboard — LEO Asset Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

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
            {lastFetched ? lastFetched.toUTCString().replace("GMT", "UTC").slice(0, 22) : "—"}
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

      {error && <div className={styles.globalError}><strong>Error:</strong> {error}</div>}
      {cooldownMsg && <div className={styles.cooldownMsg}>⏱ {cooldownMsg}</div>}

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
              <SatelliteCard
                key={sat.norad}
                sat={sat}
                customName={customNames[sat.norad]}
                onRename={handleRename}
              />
            ))}
          </div>

          <div className={styles.bottomBar}>
            <button
              className={styles.fetchBtn}
              onClick={() => refreshEverything(true)}
              disabled={loading}
            >
              ⟳ Refresh All Data
            </button>
            <DownloadMenu onSelect={handleDownloadAll} variant="outline" />
          </div>
        </>
      )}
    </>
  );
}
