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
  const [oidcKey, setOidcKey] = useState('');
  const [oidcValue, setOidcValue] = useState('');
  const [oidcError, setOidcError] = useState(null);
  const [showKeyTooltip, setShowKeyTooltip] = useState(false);
  const [showValueTooltip, setShowValueTooltip] = useState(false);
  const [authVisible, setAuthVisible] = useState(true);
  const [maskOidcValue, setMaskOidcValue] = useState(false);
  const [customReportAvailable, setCustomReportAvailable] = useState(false);
  const [customReportPath, setCustomReportPath] = useState(null);
  const logsRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [notification, setNotification] = useState(null);

  const addTestLog = (text) => setTestLogs((s) => [...s, `[${new Date().toLocaleTimeString()}] ${text}`]);

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
    setRunStatus('running');
    setTestLogs([]);

    // Create abort controller so the user can cancel the running test
    const controller = new AbortController();
    abortControllerRef.current = controller;

    addTestLog(`Starting ${testScenario} on ${browser} in ${headless ? 'headless' : 'headed'} mode.`);
    addTestLog('Overall status: RUNNING');

    // Validate OIDC JSON (if provided)
    let parsedOidcValue;
    if (oidcValue && oidcValue.trim() !== '') {
      try {
        parsedOidcValue = JSON.parse(oidcValue);
        setOidcError(null);
      } catch (err) {
        setOidcError('Invalid JSON for OIDC value. Please fix it before running the test.');
        addTestLog('Invalid OIDC JSON provided — aborting run.');
        setTestFailed(true);
        setRunStatus('failed');
        setTestInProgress(false);
        setProcessCompleted(true);
        return;
      }
    }

    try {
      const response = await fetch("/api/run-test", {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testScenario,
          browser,
          headless,
          oidcKey: oidcKey || undefined,
          oidcValue: parsedOidcValue || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));

      // Append any logs returned from the runner
      const logsFromRun = data?.logs ?? [];
      if (logsFromRun.length) setTestLogs(s => [...s, ...logsFromRun]);

      // Determine success/report availability (reportAvailable must come from server)
      const success = (response.ok && (data.success !== false));
      const report = Boolean(data.reportAvailable);
      const custom = Boolean(data.customReportAvailable);
      setReportAvailable(report);
      setCustomReportAvailable(custom);
      setCustomReportPath(data.customReportPath ?? null);
      if (report) addTestLog('Playwright HTML report is available for download.');
      if (custom) addTestLog('Custom report is available for download.');

      if (!success) {
        const message = data?.error || `Test run failed with status ${response.status}`;
        addTestLog(message);
        addTestLog('Overall status: FAILED');
        setTestFailed(true);
        setRunStatus('failed');
      } else {
        addTestLog('Test run completed successfully.');
        addTestLog('Overall status: PASSED');
        setRunStatus('passed');
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'The user aborted a request.') {
        addTestLog('Test run stopped by user.');
        setRunStatus('stopped');
        setNotification('Test execution stopped by user.');
      } else {
        addTestLog(`Error running test: ${err.message}`);
        addTestLog('Overall status: FAILED');
        setTestFailed(true);
        setRunStatus('failed');
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
    const confirmStop = window.confirm('Stop test execution? This will attempt to cancel the running test.');
    if (!confirmStop) return;
    addTestLog('User requested to stop the test.');
    setNotification('Stopping test...');
    try {
      const res = await fetch('/api/stop-test', { method: 'POST' }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res && res.ok) {
        addTestLog('Stop signal acknowledged by server.');
        setNotification(data.message || 'Stop signal sent to server.');
        setRunStatus('stopped');
      } else {
        addTestLog('Stop request failed or timed out.');
        setNotification('Stop request failed or timed out.');
      }
    } catch (err) {
      setNotification('Error sending stop: ' + err.message);
    } finally {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      // Ensure the UI is not stuck; we'll mark completed so user can interact. Poller will update final state
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
        const r = await fetch('/api/run-status');
        if (!r.ok) return;
        const data = await r.json();
        setCustomReportAvailable(Boolean(data.customReportAvailable));
        if (!data.testRunInProgress) {
          addTestLog('Server reports run has completed (status poll).');
          // Make UI reflect completed run so user can continue
          if (mounted) {
            setTestInProgress(false);
            setProcessCompleted(true);
            setRunStatus(data.customReportAvailable ? 'passed' : 'failed');
            if (data.customReportAvailable) {
              setCustomReportPath(data.customReportPath ?? null);
              addTestLog('Custom report is available for download.');
            }
          }
        }
      } catch (e) {
        // ignore transient errors
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [testInProgress]);

  // Allow user to force-reset the run state on the server and clear UI
  const resetRun = async () => {
    if (!window.confirm('Reset run state on server? This will attempt to kill any running test and clear UI state.')) return;
    setNotification('Resetting run state...');
    try {
      const res = await fetch('/api/reset-run', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setNotification('Run state reset.');
        setTestInProgress(false);
        setProcessCompleted(true);
        setRunStatus('stopped');
        addTestLog('Run state reset on server via user action.');
      } else {
        setNotification(data.error || 'Failed to reset run state.');
      }
    } catch (e) {
      setNotification('Reset failed: ' + e.message);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      fontFamily: 'Inter, Arial, sans-serif',
      color: '#333',
      height: '100vh',
      background: '#f4f7fa'
    },
    nav: {
      width: '320px',
      background: '#fff',
      borderRight: '1px solid #e0e0e0',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '32px'
    },
    main: {
      flex: 1,
      padding: '24px',
      display: 'flex',
      flexDirection: 'column'
    },
    header: {
      borderBottom: '1px solid #e0e0e0',
      paddingBottom: '16px',
      marginBottom: '16px'
    },
    button: {
      display: 'block',
      width: '100%',
      padding: '12px 16px',
      background: '#3b82f6',
      color: '#fff',
      borderRadius: '6px',
      border: 'none',
      textAlign: 'center',
      fontSize: '14px',
      cursor: 'pointer',
      marginBottom: '8px'
    },
    logContainer: {
      background: '#2d333b',
      color: '#cdd9e5',
      border: '1px solid #e0e0e0',
      borderRadius: '6px',
      height: '220px',
      overflow: 'auto',
      padding: '12px',
      fontSize: '13px',
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      fontFamily: 'monospace',
      marginTop: 'auto'
    },
    formGroup: {
        marginBottom: '16px'
    },
    label: {
        display: 'block',
        marginBottom: '8px',
        fontSize: '14px',
        fontWeight: '500'
    },
    select: {
        width: '100%',
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #ccc'
    },
    checkboxContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    infoIcon: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#e5e7eb',
        color: '#111827',
        fontSize: 12,
        marginLeft: 8,
        cursor: 'default',
        border: '1px solid #d1d5db'
    },
    tooltip: {
        position: 'absolute',
        zIndex: 20,
        background: '#111827',
        color: '#fff',
        padding: 10,
        borderRadius: 6,
        width: 280,
        fontSize: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)'
    },
    sectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10
    },
    smallButton: {
      background: 'transparent',
      border: 'none',
      color: '#3b82f6',
      cursor: 'pointer',
      fontSize: 13
    }
  }; 

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div>
            <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>QA Dashboard</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Test Automation & Reporting</p>
        </div>

        <div>
            <h2 style={{ fontSize: '16px', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '12px' }}>Test Configuration</h2>
            <div style={styles.formGroup}>
                <label style={styles.label}>Test Scenario</label>
                <select style={styles.select} value={testScenario} onChange={e => setTestScenario(e.target.value)} disabled={testInProgress}>
                    <option>Breezeai sanity dev</option>
                    <option>Breezeai sanity prod</option>
                    <option>Breezeai complete regression dev</option>
                    <option>AccionConnect sanity dev</option>
                    <option>AccionConnect sanity prod</option>
                </select>
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Browser</label>
                <select style={styles.select} value={browser} onChange={e => setBrowser(e.target.value)} disabled={testInProgress}>
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
      onChange={e => setHeadless(e.target.checked)}
      disabled={testInProgress}
    />
    <label htmlFor="headless">Run in headless mode</label>
  </div>
</div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
              <div style={styles.sectionHeader}>
                <h3 style={{ margin: 0, fontSize: 14 }}>Authentication</h3>
                <div>
                  <button style={styles.smallButton} onClick={() => setAuthVisible(v => !v)}>{authVisible ? 'Hide' : 'Show'}</button>
                </div>
              </div>

              {authVisible && (
                <>
                  <div style={styles.formGroup}>
                    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                      <label style={styles.label}>OIDC Key</label>
                      <span
                        style={styles.infoIcon}
                        onMouseEnter={() => setShowKeyTooltip(true)}
                        onMouseLeave={() => setShowKeyTooltip(false)}
                        aria-label="OIDC key help"
                      >?</span>
                      {showKeyTooltip && (
                        <div style={{ ...styles.tooltip, top: 28, left: 0 }}>
                          <strong style={{ display: 'block', marginBottom: 6 }}>How to find the OIDC key</strong>
                          <div style={{lineHeight:1.4}}>
                            1) Log in to the application and open DevTools.
                            <br />2) Go to Application &gt; Session (or Storage).
                            <br />3) Find the OIDC entry and copy the exact key (e.g. <em>oidc.user:...</em>).
                            <br />4) Paste it into this field.
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      style={styles.select}
                      value={oidcKey}
                      onChange={e => setOidcKey(e.target.value)}
                      placeholder="oidc.user:..."
                      disabled={testInProgress || !authVisible}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                      <label style={styles.label}>OIDC Value (JSON)</label>
                      <span
                        style={styles.infoIcon}
                        onMouseEnter={() => setShowValueTooltip(true)}
                        onMouseLeave={() => setShowValueTooltip(false)}
                        aria-label="OIDC value help"
                      >?</span>
                      {showValueTooltip && (
                        <div style={{ ...styles.tooltip, top: 28, left: 0 }}>
                          <strong style={{ display: 'block', marginBottom: 6 }}>How to find the OIDC value</strong>
                          <div style={{lineHeight:1.4}}>
                            1) Open DevTools and go to Application &gt; Session.
                            <br />2) Click the session entry and copy the value (JSON blob).
                            <br />3) Paste the entire JSON here. Make sure it's valid JSON before running the test.
                          </div>
                        </div>
                      )}
                    </div>

                    {!maskOidcValue ? (
                      <textarea
                        value={oidcValue}
                        onChange={e => setOidcValue(e.target.value)}
                        placeholder='{"id_token":"..."}'
                        disabled={testInProgress || !authVisible}
                        style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 4, border: '1px solid #ccc', fontFamily: 'monospace' }}
                      />
                    ) : (
                      <textarea
                        value={Array(8).fill('•').join('')}
                        readOnly
                        style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 4, border: '1px solid #ccc', fontFamily: 'monospace', background:'#f8fafc' }}
                      />
                    )}

                    {oidcError && <div style={{color:'#d9534f', fontSize:12, marginTop:8}}>{oidcError}</div>}

                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
                      <div style={{fontSize:12, color:'#666'}}>Please copy the OIDC Key and Value (from the session) and paste them here before clicking <strong>Run Test</strong>.</div>
                      <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
                        <label style={{fontSize:12, color:'#666', display:'flex', alignItems:'center', gap:8}}>
                          <input type="checkbox" checked={maskOidcValue} onChange={e => setMaskOidcValue(e.target.checked)} disabled={!authVisible} /> Mask OIDC value
                        </label>
                        {maskOidcValue && <button style={styles.smallButton} onClick={() => setMaskOidcValue(false)}>Reveal</button>}
                        <button
                          style={{ ...styles.smallButton, marginLeft: 8 }}
                          onClick={async () => {
                            // Confirm with a security warning before saving
                            if (!oidcKey || !oidcValue) {
                              setNotification('Provide both OIDC Key and OIDC Value before saving.');
                              return;
                            }
                            if (!window.confirm('Security warning: this will write sensitive OIDC data into global-setup.js on the server (a permanent file change). Do you want to proceed?')) return;

                            // Validate JSON before sending
                            let parsed;
                            try { parsed = JSON.parse(oidcValue); } catch (e) {
                              setOidcError('Invalid JSON for OIDC value. Fix it before saving.');
                              setNotification('OIDC value must be valid JSON.');
                              return;
                            }

                            setNotification('Saving OIDC to server (creating a backup)...');
                            try {
                              const res = await fetch('/api/save-oidc', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ oidcKey, oidcValue: parsed })
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                setNotification(data.error || 'Failed to save OIDC to server.');
                              } else {
                                setNotification('OIDC saved to global-setup.js (backup created).');
                              }
                            } catch (err) {
                              setNotification('Failed to save OIDC: ' + err.message);
                            }
                          }}
                          disabled={!authVisible || testInProgress}
                        >Save to file</button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{display:'flex', gap:8}}>
              <button onClick={runTest} disabled={testInProgress} style={{...styles.button, flex:1, width:120}}>
                {testInProgress ? 'Running Test...' : 'Run Test'}
              </button>
              <button onClick={stopTest} disabled={!testInProgress} style={{...styles.button, background:'#ef4444', width:120}}>
                Stop
              </button>
            </div>
        </div>
        
        <div>
             <h2 style={{ fontSize: '16px', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '12px' }}>Reporting</h2>
            {processCompleted ? (
                customReportAvailable ? (
                    <button onClick={handleDownloadReport} style={{...styles.button, background: '#16a34a'}}>
                        View Custom Report
                    </button>
                ) : reportAvailable ? (
                    <button onClick={handleDownloadReport} style={{...styles.button, background: '#16a34a'}}>
                        Download Playwright Report
                    </button>
                ) : testFailed ? (
                    <div style={{color: '#d9534f'}}>No report found due to script failure.</div>
                ) : (
                    <div style={{color: '#777'}}>No report available for this run.</div>
                )
            ) : (
                <div style={{color: '#777'}}>Run a test to generate a report.</div>
            )}
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.header}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{ margin: 0 }}>Live Test Logs</h2>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <div style={{fontSize:12, color:'#666'}}>Status:</div>
                <div style={{
                  padding:'6px 10px',
                  borderRadius:20,
                  fontSize:13,
                  fontWeight:600,
                  color:'#fff',
                  background: runStatus === 'running' ? '#f59e0b' : runStatus === 'passed' ? '#16a34a' : runStatus === 'failed' ? '#ef4444' : runStatus === 'stopped' ? '#ef4444' : '#6b7280'
                }}>{runStatus.toUpperCase()}</div>
              </div>
            </div>
            <div style={{fontSize:12,color:'#666',marginTop:8}}>Scenario: {testScenario} • Browser: {browser} • {headless ? 'Headless' : 'Headed'}</div>
        </div>
        {notification && (
          <div style={{marginTop:12, padding:'10px 12px', borderRadius:6, background: '#fff3f2', color:'#9b1c1c', border:'1px solid #f5c6cb'}}>
            {notification}
          </div>
        )}
        <div style={styles.logContainer} ref={logsRef}>
            {testLogs.length === 0 ? 
                <div style={{ color: "#777" }}>{testInProgress ? 'Running — logs will appear here...' : 'No test logs yet. Configure and run a test to begin.'}</div> : 
                testLogs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)
            }
        </div>
      </main>
    </div>
  );
}
