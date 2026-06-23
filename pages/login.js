// pages/login.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import styles from "../styles/Login.module.css";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const triggerShake = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        triggerShake(json.error || "Login failed");
        setLoading(false);
        return;
      }
      const dest =
        typeof router.query.from === "string" && router.query.from.startsWith("/")
          ? router.query.from
          : "/";
      router.push(dest);
    } catch {
      triggerShake("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In · LEO Asset Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className={styles.root}>
        <div className={styles.starsFar} aria-hidden="true" />
        <div className={styles.starsNear} aria-hidden="true" />

        <div className={`${styles.card} ${mounted ? styles.cardIn : ""} ${shake ? styles.shake : ""}`}>
          <div className={styles.orbit} aria-hidden="true">
            <div className={styles.orbitRing} />
            <div className={styles.orbitDot} />
          </div>

          <h1 className={styles.title}>LEO Asset Tracker</h1>
          <p className={styles.subtitle}>Authorized Access Only</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="username">Username</label>
              <input
                id="username"
                className={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input
                id="password"
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className={styles.error}>⚠ {error}</div>}

            <button className={styles.btn} type="submit" disabled={loading}>
              <span className={styles.btnInner}>
                {loading ? <span className={styles.spinner} /> : null}
                {loading ? "Verifying" : "Sign In"}
              </span>
            </button>
          </form>

          <p className={styles.footer}>Session expires after 12 hours of issuance</p>
        </div>
      </div>
    </>
  );
}

