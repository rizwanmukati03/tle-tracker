// pages/archive.js
import { useState, useCallback, useEffect } from "react";
import Head from "next/head";
import styles from "../styles/Archive.module.css";
import { SATELLITES } from "../lib/satellites";

function formatArchiveDate(ms) {
  return new Date(ms).toUTCString().replace("GMT", "UTC");
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function totalEntriesLabel(count) {
  return `${count} entr${count === 1 ? "y" : "ies"}`;
}

// Shared dropdown download button
function DownloadMenu({ onSelect, variant = "solid", label = "↓ Download" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useState(null);
  const ref = { current: null };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.downloadWrapper} ref={el => { ref.current = el; }}>
      <button
        className={variant === "outline" ? styles.btnDownloadOutline : styles.btnDownloadSolid}
        onClick={() => setOpen(o => !o)}
      >
        {label} <span className={styles.menuChevron}>{open ? "▲" : "▼"}</span>
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

function BackupSection() {
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupErr, setBackupErr] = useState(null);
  const [lastBackupCount, setLastBackupCount] = useState(null);

  const handleBackup = useCallback(async () => {
    setBackupLoading(true);
    setBackupErr(null);
    try {
      // Read custom names set on the Dashboard
      let customNames = {};
      try {
        const stored = localStorage.getItem("leo_satellite_names");
        if (stored) customNames = JSON.parse(stored);
      } catch {}

      const results = await Promise.all(
        SATELLITES.map(async (sat) => {
          const res = await fetch(`/api/archive?norad=${sat.norad}&limit=5000`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `Failed for ${sat.name}`);
          return {
            norad: sat.norad,
            name: customNames[sat.norad] || sat.name,
            defaultName: sat.name,
            entries: json.entries,
          };
        })
      );
      const totalEntries = results.reduce((sum, r) => sum + r.entries.length, 0);
      const backup = {
        exportedAt: new Date().toISOString(),
        source: "LEO Asset Tracker — full archive backup",
        satellites: results,
      };
      const dateTag = new Date().toISOString().slice(0, 10);
      downloadJson(`leo_tracker_archive_backup_${dateTag}.json`, backup);
      setLastBackupCount(totalEntries);
    } catch (e) {
      setBackupErr(e.message);
    } finally {
      setBackupLoading(false);
    }
  }, []);

  return (
    <div className={styles.backupPanel}>
      <div className={styles.backupHeader}>
        <span className={styles.backupTitle}>🛡 Full archive backup</span>
        <span className={styles.backupSubtitle}>
          Every entry, every satellite, no date filter — an independent copy you hold yourself.
        </span>
      </div>
      <button className={styles.backupBtn} onClick={handleBackup} disabled={backupLoading}>
        {backupLoading ? "Exporting…" : "↓ Download full backup (.json)"}
      </button>
      {backupErr && <div className={styles.backupError}>{backupErr}</div>}
      {lastBackupCount !== null && !backupErr && (
        <div className={styles.backupSuccess}>
          ✓ Exported {totalEntriesLabel(lastBackupCount)} across all 7 satellites.
        </div>
      )}
    </div>
  );
}

function ArchiveEntry({ entry, satName }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${entry.line1}\n${entry.line2}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format) => {
    const content = `${satName}\n${entry.line1}\n${entry.line2}`;
    const dateTag = new Date(entry.epochMs ?? entry.fetchedAt).toISOString().slice(0, 10);
    const dl = (ext) => triggerDownload(`${dateTag}.${ext}`, content);
    if (format === "tle") dl("tle");
    else if (format === "txt") dl("txt");
    else { dl("tle"); setTimeout(() => dl("txt"), 300); }
  };

  return (
    <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <span className={styles.entryDate}>{formatArchiveDate(entry.epochMs ?? entry.fetchedAt)}</span>
        <span className={styles.entrySource}>via {entry.source}</span>
      </div>
      <div className={styles.entryTle}>
        <code>{entry.line1}</code>
        <code>{entry.line2}</code>
      </div>
      <div className={styles.entryFooter}>
        <span className={styles.entryCaptured}>captured {formatArchiveDate(entry.fetchedAt)}</span>
        <div className={styles.entryActions}>
          <button className={styles.copyOneBtn} onClick={handleCopy}>
            {copied ? "✓ Copied" : "Copy TLE"}
          </button>
          <DownloadMenu onSelect={handleDownload} variant="solid" label="↓ Download" />
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const [selectedNorad, setSelectedNorad] = useState(SATELLITES[0].norad);
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [results, setResults] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [customNames, setCustomNames] = useState({});

  // Load custom satellite names set on the Dashboard
  useEffect(() => {
    try {
      const stored = localStorage.getItem("leo_satellite_names");
      if (stored) setCustomNames(JSON.parse(stored));
    } catch {}
  }, []);

  const getSatName = (norad) => {
    const sat = SATELLITES.find(s => s.norad === Number(norad));
    return customNames[norad] || sat?.name || `NORAD-${norad}`;
  };

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      let url = `/api/archive?norad=${selectedNorad}&limit=200`;
      if (fromDateTime) url += `&from=${new Date(fromDateTime + "Z").getTime()}`;
      if (toDateTime) url += `&to=${new Date(toDateTime + "Z").getTime()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch archive");
      setResults(json.entries);
      setVisibleCount(10);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedNorad, fromDateTime, toDateTime]);

  const handleDownloadAll = (format) => {
    if (!results || results.length === 0) return;
    const satName = getSatName(selectedNorad);
    const content = results
      .map(e => `${satName}\n${e.line1}\n${e.line2}`)
      .join("\n");
    const dl = (ext) => triggerDownload(`${satName}_archive.${ext}`, content);
    if (format === "tle") dl("tle");
    else if (format === "txt") dl("txt");
    else { dl("tle"); setTimeout(() => dl("txt"), 300); }
  };

  const visibleResults = results ? results.slice(0, visibleCount) : [];
  const remaining = results ? results.length - visibleCount : 0;
  const currentSatName = getSatName(selectedNorad);

  return (
    <>
      <Head><title>TLE Archive — LEO Asset Tracker</title></Head>

      <h2 className={styles.pageTitle}>📜 TLE archive</h2>
      <p className={styles.pageSubtitle}>Look up a satellite&apos;s recorded orbital data over time.</p>

      <BackupSection />

      <div className={styles.searchPanel}>
        <div className={styles.filterRow}>
          <label className={styles.filterLabel}>
            Satellite
            <select
              className={styles.select}
              value={selectedNorad}
              onChange={e => setSelectedNorad(Number(e.target.value))}
            >
              {SATELLITES.map(s => (
                <option key={s.norad} value={s.norad}>
                  {customNames[s.norad] || s.name} (NORAD {s.norad})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterLabel}>
            From (UTC)
            <input type="datetime-local" className={styles.dateInput} value={fromDateTime} onChange={e => setFromDateTime(e.target.value)} />
          </label>
          <label className={styles.filterLabel}>
            To (UTC)
            <input type="datetime-local" className={styles.dateInput} value={toDateTime} onChange={e => setToDateTime(e.target.value)} />
          </label>
          <button className={styles.searchBtn} onClick={handleSearch} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {err && <div className={styles.errorBox}>{err}</div>}

      {results && results.length === 0 && !loading && (
        <div className={styles.emptyState}>No archived entries found for this satellite and range.</div>
      )}

      {results && results.length > 0 && (
        <>
          <div className={styles.resultsHeader}>
            <span>{results.length} entr{results.length === 1 ? "y" : "ies"} found</span>
            <DownloadMenu onSelect={handleDownloadAll} variant="outline" label={`↓ Download all (${results.length})`} />
          </div>

          <div className={styles.resultsList}>
            {visibleResults.map((entry, i) => (
              <ArchiveEntry key={i} entry={entry} satName={currentSatName} />
            ))}
          </div>

          {remaining > 0 && (
            <button className={styles.loadMoreBtn} onClick={() => setVisibleCount(v => v + 10)}>
              Show {Math.min(10, remaining)} more ({remaining} remaining)
            </button>
          )}
        </>
      )}
    </>
  );
}
