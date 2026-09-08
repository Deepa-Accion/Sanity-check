import React, { useState, useRef, useEffect } from "react";

export default function App() {
  const [testInProgress, setTestInProgress] = useState(false);
  const [testLogs, setTestLogs] = useState([]);
  const [processCompleted, setProcessCompleted] = useState(false);
  const [testFailed, setTestFailed] = useState(false);
  const [testScenario, setTestScenario] = useState("Breezeai sanity dev");
  const [browser, setBrowser] = useState("chromium");
  // Default to NOT headless so users can see the browser by default
  const [headless, setHeadless] = useState(false);
  const [runStatus, setRunStatus] = useState("idle"); // idle, running, passed, failed
  const [reportAvailable, setReportAvailable] = useState(false);
  const [customReportAvailable, setCustomReportAvailable] = useState(false);
  const [customReportPath, setCustomReportPath] = useState(null);
  const [localhostUrl, setLocalhostUrl] = useState("http://localhost:5173");
  const [localhostError, setLocalhostError] = useState(null);
  const logsRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [notification, setNotification] = useState(null);

  // Localhost sanity mode: user supplies a localhost URL instead of credentials.
  const isLocalhost = testScenario === "Breezeai sanity localhost";

  const addTestLog = (text) =>
    setTestLogs((s) => [...s, `[${new Date().toLocaleTimeString()}] ${text}`]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [testLogs]);

  const runTest = async () => {
    setTestInProgress(true);
    setProcessCompleted(false);
    setTestFailed(false);
    setReportAvailable(false);
    setRunStatus("running");
    setTestLogs([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    addTestLog(`Starting ${testScenario} on ${browser} in ${headless ? "headless" : "headed"} mode.`);
    addTestLog("Overall status: RUNNING");

    // Localhost mode: validate the localhost URL
    if (isLocalhost) {
      const candidate = (localhostUrl || "").trim();
      let validUrl = false;
      try {
        const u = new URL(candidate);
        validUrl = u.protocol === "http:" || u.protocol === "https:";
      } catch (e) {
        validUrl = false;
      }
      if (!validUrl) {
        setLocalhostError("Enter a valid localhost URL, e.g. http://localhost:5173");
        addTestLog("Invalid localhost URL — aborting run.");
        setTestFailed(true);
        setRunStatus("failed");
        setTestInProgress(false);
        setProcessCompleted(true);
        return;
      }
      setLocalhostError(null);
    }

    try {
      const body = isLocalhost
        ? { testScenario, browser, headless, isLocalhost: true, localhostUrl: localhostUrl.trim() }
        : { testScenario, browser, headless };

      const response = await fetch("/api/run-test", {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      const logsFromRun = data?.logs ?? [];
      if (logsFromRun.length) setTestLogs((s) => [...s, ...logsFromRun]);

      const success = response.ok && data.success !== false;
      const report = Boolean(data.reportAvailable);
      const custom = Boolean(data.customReportAvailable);
      setReportAvailable(report);
      setCustomReportAvailable(custom);
      setCustomReportPath(data.customReportPath ?? null);
      if (report) addTestLog("Playwright HTML report is available for download.");
      if (custom) addTestLog("Custom report is available for download.");

      if (!success) {
        addTestLog(data?.error || `Test run failed with status ${response.status}`);
        addTestLog("Overall status: FAILED");
        setTestFailed(true);
        setRunStatus("failed");
      } else {
        addTestLog("Test run completed successfully.");
        addTestLog("Overall status: PASSED");
        setRunStatus("passed");
      }
    } catch (err) {
      if (err.name === "AbortError" || err.message === "The user aborted a request.") {
        addTestLog("Test run stopped by user.");
        setRunStatus("stopped");
        setNotification("Test execution stopped by user.");
      } else {
        addTestLog(`Error running test: ${err.message}`);
        addTestLog("Overall status: FAILED");
        setTestFailed(true);
        setRunStatus("failed");
      }
    } finally {
      abortControllerRef.current = null;
      setTestInProgress(false);
      setProcessCompleted(true);
    }
  };

  const handleDownloadReport = () => {
    if (customReportAvailable) {
      window.open("/api/tests/custom-report", "_blank");
    } else {
      window.open("/api/tests/report", "_blank");
    }
  };

  const stopTest = async () => {
    if (!testInProgress) return;
    const confirmStop = window.confirm(
      "Stop test execution? This will attempt to cancel the running test."
    );
    if (!confirmStop) return;
    addTestLog("User requested to stop the test.");
    setNotification("Stopping test...");
    try {
      const res = await fetch("/api/stop-test", { method: "POST" }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res && res.ok) {
        addTestLog("Stop signal acknowledged by server.");
        setNotification(data.message || "Stop signal sent to server.");
        setRunStatus("stopped");
      } else {
        addTestLog("Stop request failed or timed out.");
        setNotification("Stop request failed or timed out.");
      }
    } catch (err) {
      setNotification("Error sending stop: " + err.message);
    } finally {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setTestInProgress(false);
      setProcessCompleted(true);
    }
  };

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  // Poll server run status while a run is marked in-progress locally
  useEffect(() => {
    if (!testInProgress) return;
    let mounted = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/run-status");
        if (!r.ok) return;
        const data = await r.json();
        setCustomReportAvailable(Boolean(data.customReportAvailable));
        if (!data.testRunInProgress) {
          addTestLog("Server reports run has completed (status poll).");
          if (mounted) {
            setTestInProgress(false);
            setProcessCompleted(true);
            setRunStatus(data.customReportAvailable ? "passed" : "failed");
            if (data.customReportAvailable) {
              setCustomReportPath(data.customReportPath ?? null);
              addTestLog("Custom report is available for download.");
            }
          }
        }
      } catch (e) {
        // ignore transient errors
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [testInProgress]);

  // Force-reset run state on the server
  const resetRun = async () => {
    if (
      !window.confirm(
        "Reset run state on server? This will attempt to kill any running test and clear UI state."
      )
    )
      return;
    setNotification("Resetting run state...");
    try {
      const res = await fetch("/api/reset-run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setNotification("Run state reset.");
        setTestInProgress(false);
        setProcessCompleted(true);
        setRunStatus("stopped");
        addTestLog("Run state reset on server via user action.");
      } else {
        setNotification(data.error || "Failed to reset run state.");
      }
    } catch (e) {
      setNotification("Reset failed: " + e.message);
    }
  };

  const styles = {
    container: {
      display: "flex",
      fontFamily: "Inter, Arial, sans-serif",
      color: "#333",
      height: "100vh",
      background: "#f4f7fa",
    },
    nav: {
      width: "320px",
      background: "#fff",
      borderRight: "1px solid #e0e0e0",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "32px",
      overflowY: "auto",
    },
    main: {
      flex: 1,
      padding: "24px",
      display: "flex",
      flexDirection: "column",
    },
    header: {
      borderBottom: "1px solid #e0e0e0",
      paddingBottom: "16px",
      marginBottom: "16px",
    },
    button: {
      display: "block",
      width: "100%",
      padding: "12px 16px",
      background: "#3b82f6",
      color: "#fff",
      borderRadius: "6px",
      border: "none",
      textAlign: "center",
      fontSize: "14px",
      cursor: "pointer",
      marginBottom: "8px",
    },
    logContainer: {
      background: "#2d333b",
      color: "#cdd9e5",
      border: "1px solid #e0e0e0",
      borderRadius: "6px",
      height: "220px",
      overflow: "auto",
      padding: "12px",
      fontSize: "13px",
      lineHeight: 1.6,
      whiteSpace: "pre-wrap",
      fontFamily: "monospace",
      marginTop: "auto",
    },
    formGroup: {
      marginBottom: "16px",
    },
    label: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      fontWeight: "500",
    },
    select: {
      width: "100%",
      padding: "8px",
      borderRadius: "4px",
      border: "1px solid #ccc",
    },
    checkboxContainer: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    authBadge: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 12px",
      borderRadius: "6px",
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      fontSize: "13px",
      color: "#15803d",
      marginTop: "4px",
    },
    smallButton: {
      background: "transparent",
      border: "none",
      color: "#3b82f6",
      cursor: "pointer",
      fontSize: 13,
    },
  };

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        {/* ── Title ── */}
        <div>
          <h1 style={{ fontSize: "24px", margin: "0 0 8px 0" }}>QA Dashboard</h1>
          <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
            Test Automation &amp; Reporting
          </p>
        </div>

        {/* ── Test Configuration ── */}
        <div>
          <h2
            style={{
              fontSize: "16px",
              borderBottom: "1px solid #eee",
              paddingBottom: "8px",
              marginBottom: "12px",
            }}
          >
            Test Configuration
          </h2>

          <div style={styles.formGroup}>
            <label style={styles.label}>Test Scenario</label>
            <select
              style={styles.select}
              value={testScenario}
              onChange={(e) => setTestScenario(e.target.value)}
              disabled={testInProgress}
            >
              <option>Breezeai sanity dev</option>
              <option>Breezeai sanity localhost</option>
              <option>Breezeai sanity prod</option>
              <option>Breezeai complete regression dev</option>
              <option>AccionConnect sanity dev</option>
              <option>AccionConnect sanity prod</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Browser</label>
            <select
              style={styles.select}
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
              disabled={testInProgress}
            >
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <div style={styles.checkboxContainer}>
              <input
                type="checkbox"
                id="headless"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                disabled={testInProgress}
              />
              <label htmlFor="headless">Run in headless mode</label>
            </div>
          </div>

          {/* Localhost URL — only shown for localhost scenario */}
          {isLocalhost && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Localhost URL</label>
              <input
                style={styles.select}
                value={localhostUrl}
                onChange={(e) => setLocalhostUrl(e.target.value)}
                placeholder="http://localhost:5173"
                disabled={testInProgress}
              />
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Localhost mode runs a generated copy of the sanity suite against this URL. No
                authentication required.
              </div>
              {localhostError && (
                <div style={{ color: "#d9534f", fontSize: 12, marginTop: 6 }}>
                  {localhostError}
                </div>
              )}
            </div>
          )}

          {/* Auth status badge — shown for authenticated (non-localhost) scenarios */}
          {!isLocalhost && (
            <div style={styles.authBadge}>
              <span style={{ fontSize: "16px" }}>🔒</span>
              <div>
                <div style={{ fontWeight: 600 }}>Auto-login enabled</div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>
                  Logs in to <strong>https://ai.accionbreeze.com</strong> automatically before
                  running tests.
                </div>
              </div>
            </div>
          )}

          {/* Run / Stop */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={runTest}
              disabled={testInProgress}
              style={{ ...styles.button, flex: 1, width: 120, marginBottom: 0 }}
            >
              {testInProgress ? "Running Test..." : "Run Test"}
            </button>
            <button
              onClick={stopTest}
              disabled={!testInProgress}
              style={{ ...styles.button, background: "#ef4444", width: 120, marginBottom: 0 }}
            >
              Stop
            </button>
          </div>
        </div>

        {/* ── Reporting ── */}
        <div>
          <h2
            style={{
              fontSize: "16px",
              borderBottom: "1px solid #eee",
              paddingBottom: "8px",
              marginBottom: "12px",
            }}
          >
            Reporting
          </h2>
          {processCompleted ? (
            customReportAvailable ? (
              <button
                onClick={handleDownloadReport}
                style={{ ...styles.button, background: "#16a34a" }}
              >
                View Custom Report
              </button>
            ) : reportAvailable ? (
              <button
                onClick={handleDownloadReport}
                style={{ ...styles.button, background: "#16a34a" }}
              >
                Download Playwright Report
              </button>
            ) : testFailed ? (
              <div style={{ color: "#d9534f" }}>No report found due to script failure.</div>
            ) : (
              <div style={{ color: "#777" }}>No report available for this run.</div>
            )
          ) : (
            <div style={{ color: "#777" }}>Run a test to generate a report.</div>
          )}
        </div>
      </nav>

      {/* ── Main log area ── */}
      <main style={styles.main}>
        <div style={styles.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Live Test Logs</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Status:</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background:
                    runStatus === "running"
                      ? "#f59e0b"
                      : runStatus === "passed"
                      ? "#16a34a"
                      : runStatus === "failed"
                      ? "#ef4444"
                      : runStatus === "stopped"
                      ? "#ef4444"
                      : "#6b7280",
                }}
              >
                {runStatus.toUpperCase()}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
            Scenario: {testScenario} • Browser: {browser} • {headless ? "Headless" : "Headed"}
          </div>
        </div>

        {notification && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 6,
              background: "#fff3f2",
              color: "#9b1c1c",
              border: "1px solid #f5c6cb",
            }}
          >
            {notification}
          </div>
        )}

        <div style={styles.logContainer} ref={logsRef}>
          {testLogs.length === 0 ? (
            <div style={{ color: "#777" }}>
              {testInProgress
                ? "Running — logs will appear here..."
                : "No test logs yet. Configure and run a test to begin."}
            </div>
          ) : (
            testLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                {log}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
