import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Play, Square, RefreshCcw, Activity, Server, Clock, Trash2, 
  Film, CheckCircle, Clock3, AlertCircle, Terminal, History, ListVideo
} from 'lucide-react';
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
  const handlePause = async () => {
    try { await axios.post(`${API}/pause`); fetchAll(); } catch {}
  };
  const handleResume = async () => {
    try { await axios.post(`${API}/resume`); fetchAll(); } catch {}
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
          <div className="logo-icon"><Activity size={24} color="white" /></div>
          <div>
            <h2>Forever Decoder</h2>
            <span>Video Processing Hub</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className={`nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
            <span className="nav-icon"><Activity size={18} /></span> Dashboard
          </div>
          <div className={`nav-item ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            <span className="nav-icon"><ListVideo size={18} /></span> Navbat
            {stats.totalPending > 0 && <span className="panel-count">{stats.totalPending}</span>}
          </div>
          <div className={`nav-item ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <span className="nav-icon"><History size={18} /></span> Tarix
          </div>
          <div className={`nav-item ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
            <span className="nav-icon"><Terminal size={18} /></span> Terminal
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
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {tab === 'dashboard' ? <><Activity size={28}/> Dashboard</> : 
             tab === 'queue' ? <><ListVideo size={28}/> Navbat</> : 
             tab === 'history' ? <><History size={28}/> Tarix</> : 
             <><Terminal size={28}/> Terminal</>}
          </h1>
          <div className="top-bar-actions">
            {status.isPaused ? (
               <button className="btn btn-primary" onClick={handleResume}>
                 ▶ Davom etish
               </button>
            ) : (
               <button className="btn btn-ghost" onClick={handlePause} style={{ color: '#f59e0b' }}>
                 ⏸ Pauza
               </button>
            )}
            <button className="btn btn-ghost" onClick={handleProcessNow} disabled={status.isRunning}>
              <Play size={16}/> Hozir Ishga Tushir
            </button>
            {!status.cronActive ? (
              <button className="btn btn-primary" onClick={handleStart}>
                <RefreshCcw size={16}/> Auto Renderni Yoqish
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleStop}>
                <Square size={16}/> To'xtatish
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
                  <div className="stat-icon blue"><Film size={18} /></div>
                </div>
                <div className="stat-value">{stats.totalVideos}</div>
              </div>
              <div className="stat-card green animate-in">
                <div className="stat-header">
                  <h4>Tayyor</h4>
                  <div className="stat-icon green"><CheckCircle size={18} /></div>
                </div>
                <div className="stat-value">{stats.totalCompleted}</div>
              </div>
              <div className="stat-card amber animate-in">
                <div className="stat-header">
                  <h4>Navbatda</h4>
                  <div className="stat-icon amber"><Clock size={18} /></div>
                </div>
                <div className="stat-value">{stats.totalPending}</div>
              </div>
              <div className="stat-card purple animate-in">
                <div className="stat-header">
                  <h4>Xatolar</h4>
                  <div className="stat-icon purple"><AlertCircle size={18} /></div>
                </div>
                <div className="stat-value">{stats.totalErrors}</div>
              </div>
            </div>

            {/* Process Card */}
            <div className="process-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {status.isRunning ? <><RefreshCcw size={18} className="spin-icon" /> Hozir Ishlayapti...</> : <><Clock3 size={18} /> Kutmoqda</>}
              </h3>
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
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16} /> Kutayotganlar</h3>
                  <span className="panel-count">{stats.totalPending}</span>
                </div>
                <div className="panel-body">
                  {stats.pending.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon"><CheckCircle size={32} /></span> Navbat bo'sh!</div>
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
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} /> So'nggi Tayyorlar</h3>
                  <span className="panel-count">{stats.totalCompleted}</span>
                </div>
                <div className="panel-body">
                  {stats.completed.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon"><Film size={32} /></span> Hali tayyor video yo'q</div>
                  ) : stats.completed.slice(0, 6).map((c, i) => (
                    <div key={i} className="gallery-item">
                      <div className="gallery-thumb">
                        {c.thumbnails && c.thumbnails[0] ? (
                          <img src={c.thumbnails[0]} alt="thumb" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}><Film size={20} /></div>
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
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Terminal size={14} /> Jonli Terminal</h3>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={handleClearLogs}><Trash2 size={12} /> Tozalash</button>
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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ListVideo size={16} /> Barcha Navbatdagi Videolar</h3>
              <span className="panel-count">{stats.totalPending} ta</span>
            </div>
            <div className="panel-body">
              {stats.pending.length === 0 ? (
                <div className="empty-state"><span className="empty-icon"><CheckCircle size={40} /></span> Navbat bo'sh — barcha videolar tayyor!</div>
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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><History size={16} /> Render Tarixi (Ushbu sessiya)</h3>
              <span className="panel-count">{stats.history.length} ta</span>
            </div>
            <div className="panel-body">
              {stats.history.length === 0 ? (
                <div className="empty-state"><span className="empty-icon"><History size={40} /></span> Hali hech qanday video render qilinmagan</div>
              ) : stats.history.map((h, i) => (
                <div key={i} className="queue-item">
                  <div className="queue-item-left">
                    <span className="queue-num" style={{ background: h.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: h.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {h.status === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Terminal size={14} /> To'liq Terminal</h3>
              <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }} onClick={handleClearLogs}><Trash2 size={12} /> Tozalash</button>
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
