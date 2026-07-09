import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './index.css';

const API = 'http://localhost:5000/api';

const STEPS = ['extracting', 'downloading', 'detecting_lang', 'transcoding', 'uploading', 'updating_db'];
const STEP_LABELS = ['Extract', 'Download', 'AI Til', 'FFmpeg', 'Upload', 'DB'];

function App() {
  const [status, setStatus] = useState({
    isRunning: false, cronActive: false, status: 'Yuklanmoqda...',
    currentMovieCode: null, currentLanguage: null, currentStep: null,
    progress: 0, logs: [], history: [],
    totalProcessed: 0, totalErrors: 0, serverUptime: null
  });

  const [stats, setStats] = useState({
    totalVideos: 0, totalPending: 0, totalCompleted: 0,
    totalProcessed: 0, totalErrors: 0,
    pending: [], completed: [], history: [], uptime: null
  });

  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState('dashboard');

  const fetchAll = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        axios.get(`${API}/status`),
        axios.get(`${API}/stats`)
      ]);
      setStatus(s.data);
      setStats(d.data);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 2500);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const handleStart = async () => {
    try { await axios.post(`${API}/start`); fetchAll(); } catch {}
  };
  const handleStop = async () => {
    try { await axios.post(`${API}/stop`); fetchAll(); } catch {}
  };
  const handleProcessNow = async () => {
    try { await axios.post(`${API}/process-now`); fetchAll(); } catch {}
  };
  const handleClearLogs = async () => {
    try { await axios.post(`${API}/clear-logs`); fetchAll(); } catch {}
  };

  const getFlag = (lang) => {
    if (lang === 'uzb') return '🇺🇿 O\'zbek';
    if (lang === 'rus') return '🇷🇺 Rus';
    if (lang === 'eng') return '🇺🇸 Ingliz';
    return lang ? `🌐 ${lang}` : '—';
  };

  const getUptime = () => {
    if (!stats.uptime) return '—';
    const diff = Math.floor((Date.now() - new Date(stats.uptime).getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h}s ${m}d ${s}s`;
  };

  const getStepIndex = () => STEPS.indexOf(status.currentStep);

  return (
    <div className="app-layout">
      {/* ====== SIDEBAR ====== */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">⚡</div>
          <div>
            <h2>Forever Decoder</h2>
            <span>Video Processing Hub</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
            <span className="nav-icon">📊</span> Dashboard
          </div>
          <div className={`nav-item ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            <span className="nav-icon">⏳</span> Navbat
            {stats.totalPending > 0 && <span className="panel-count">{stats.totalPending}</span>}
          </div>
          <div className={`nav-item ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <span className="nav-icon">📜</span> Tarix
          </div>
          <div className={`nav-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
            <span className="nav-icon">🖥️</span> Terminal
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="server-indicator">
            <div className={`server-dot ${connected ? 'online' : 'offline'}`}></div>
            <span>{connected ? 'Server Online' : 'Server Offline'}</span>
          </div>
          <div className="uptime-text">Uptime: {getUptime()}</div>
        </div>
      </aside>

      {/* ====== MAIN ====== */}
      <main className="main-content">
        <div className="top-bar">
          <h1>{tab === 'dashboard' ? '📊 Dashboard' : tab === 'queue' ? '⏳ Navbat' : tab === 'history' ? '📜 Tarix' : '🖥️ Terminal'}</h1>
          <div className="top-bar-actions">
            <button className="btn btn-ghost" onClick={handleProcessNow} disabled={status.isRunning}>
              ▶ Hozir Ishga Tushir
            </button>
            {!status.cronActive ? (
              <button className="btn btn-primary" onClick={handleStart}>
                ⚡ Auto Renderni Yoqish
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleStop}>
                ⏹ To'xtatish
              </button>
            )}
          </div>
        </div>

        {/* ====== DASHBOARD TAB ====== */}
        {tab === 'dashboard' && (
          <>
            {/* Stats Row */}
            <div className="stats-row">
              <div className="stat-card blue animate-in">
                <div className="stat-header">
                  <h4>Jami Videolar</h4>
                  <div className="stat-icon blue">🎬</div>
                </div>
                <div className="stat-value">{stats.totalVideos}</div>
              </div>
              <div className="stat-card green animate-in">
                <div className="stat-header">
                  <h4>Tayyor</h4>
                  <div className="stat-icon green">✅</div>
                </div>
                <div className="stat-value">{stats.totalCompleted}</div>
              </div>
              <div className="stat-card amber animate-in">
                <div className="stat-header">
                  <h4>Navbatda</h4>
                  <div className="stat-icon amber">⏳</div>
                </div>
                <div className="stat-value">{stats.totalPending}</div>
              </div>
              <div className="stat-card purple animate-in">
                <div className="stat-header">
                  <h4>Xatolar</h4>
                  <div className="stat-icon purple">❌</div>
                </div>
                <div className="stat-value">{stats.totalErrors}</div>
              </div>
            </div>

            {/* Process Card */}
            <div className="process-card">
              <h3>{status.isRunning ? '🔄 Hozir Ishlayapti...' : '💤 Kutmoqda'}</h3>
              <div className="process-info">
                <div className="process-detail">
                  <label>Video Kodi</label>
                  <div className="detail-value">{status.currentMovieCode || '—'}</div>
                </div>
                <div className="process-detail">
                  <label>AI Til</label>
                  <div className="detail-value lang-flag">{getFlag(status.currentLanguage)}</div>
                </div>
                <div className="process-detail">
                  <label>Progress</label>
                  <div className="detail-value">{status.progress}%</div>
                </div>
              </div>

              <div className="step-indicator">
                {STEPS.map((s, i) => (
                  <div key={s} className={`step-dot ${i < getStepIndex() ? 'done' : i === getStepIndex() ? 'active' : ''}`}></div>
                ))}
              </div>
              <div className="step-labels">
                {STEP_LABELS.map(l => <span key={l}>{l}</span>)}
              </div>

              <div className="progress-bar-wrapper">
                <div className="progress-bar-fill" style={{ width: `${status.progress}%` }}></div>
              </div>
            </div>

            {/* Two Panels */}
            <div className="panels-grid">
              <div className="panel">
                <div className="panel-header">
                  <h3>⏳ Kutayotganlar</h3>
                  <span className="panel-count">{stats.totalPending}</span>
                </div>
                <div className="panel-body">
                  {stats.pending.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon">🎉</span> Navbat bo'sh!</div>
                  ) : stats.pending.slice(0, 8).map((p, i) => (
                    <div key={i} className="queue-item">
                      <div className="queue-item-left">
                        <span className="queue-num">{i + 1}</span>
                        <span>{p.movie_code}</span>
                      </div>
                      <span className="queue-badge">Kutmoqda</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h3>✅ So'nggi Tayyorlar</h3>
                  <span className="panel-count">{stats.totalCompleted}</span>
                </div>
                <div className="panel-body">
                  {stats.completed.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon">📭</span> Hali tayyor video yo'q</div>
                  ) : stats.completed.slice(0, 6).map((c, i) => (
                    <div key={i} className="gallery-item">
                      <div className="gallery-thumb">
                        {c.thumbnails && c.thumbnails[0] ? (
                          <img src={c.thumbnails[0]} alt="thumb" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎬</div>
                        )}
                      </div>
                      <div className="gallery-info">
                        <strong>{c.movie_code}</strong>
                        <div className="res-tags">
                          {c.resolutions.map(r => <span key={r} className="res-tag">{r}</span>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Inline Log */}
            <div className="log-panel">
              <div className="log-header">
                <div className="log-dots"><span></span><span></span><span></span></div>
                <h3>🖥️ Jonli Terminal</h3>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={handleClearLogs}>Tozalash</button>
              </div>
              <div className="log-body">
                {status.logs.slice(0, 30).map((l, i) => (
                  <div key={i} className="log-line">
                    <span className="log-ts">{new Date(l.time).toLocaleTimeString()}</span>
                    <span className={`log-text ${l.level || 'info'}`}>{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ====== QUEUE TAB ====== */}
        {tab === 'queue' && (
          <div className="panel" style={{ maxHeight: 'none', flex: 1 }}>
            <div className="panel-header">
              <h3>⏳ Barcha Navbatdagi Videolar</h3>
              <span className="panel-count">{stats.totalPending} ta</span>
            </div>
            <div className="panel-body">
              {stats.pending.length === 0 ? (
                <div className="empty-state"><span className="empty-icon">🎉</span> Navbat bo'sh — barcha videolar tayyor!</div>
              ) : stats.pending.map((p, i) => (
                <div key={i} className="queue-item">
                  <div className="queue-item-left">
                    <span className="queue-num">{i + 1}</span>
                    <span>{p.movie_code}</span>
                  </div>
                  <span className="queue-badge">Kutmoqda</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====== HISTORY TAB ====== */}
        {tab === 'history' && (
          <div className="panel" style={{ maxHeight: 'none', flex: 1 }}>
            <div className="panel-header">
              <h3>📜 Render Tarixi (Ushbu sessiya)</h3>
              <span className="panel-count">{stats.history.length} ta</span>
            </div>
            <div className="panel-body">
              {stats.history.length === 0 ? (
                <div className="empty-state"><span className="empty-icon">📭</span> Hali hech qanday video render qilinmagan</div>
              ) : stats.history.map((h, i) => (
                <div key={i} className="queue-item">
                  <div className="queue-item-left">
                    <span className="queue-num" style={{ background: h.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: h.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {h.status === 'success' ? '✓' : '✗'}
                    </span>
                    <span>{h.movieCode}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {h.langCode && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getFlag(h.langCode)}</span>}
                    <div className="res-tags">
                      {h.resolutions && h.resolutions.map(r => <span key={r} className="res-tag">{r}</span>)}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{h.duration}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====== LOGS TAB ====== */}
        {tab === 'logs' && (
          <div className="log-panel" style={{ flex: 1 }}>
            <div className="log-header">
              <div className="log-dots"><span></span><span></span><span></span></div>
              <h3>🖥️ To'liq Terminal</h3>
              <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={handleClearLogs}>Tozalash</button>
            </div>
            <div className="log-body" style={{ height: 'calc(100vh - 200px)' }}>
              {status.logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span className="log-ts">{new Date(l.time).toLocaleTimeString()}</span>
                  <span className={`log-text ${l.level || 'info'}`}>{l.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
