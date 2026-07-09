import { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [state, setState] = useState({
    isRunning: false,
    status: 'Yuklanmoqda...',
    currentMovieCode: null,
    currentLanguage: null,
    progress: 0,
    logs: []
  });

  const [dashboardData, setDashboardData] = useState({
    pending: [],
    recent: []
  });

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);
      setState(res.data);
    } catch (err) {
      setState(prev => ({ ...prev, status: 'Serverga ulanishda xato (Backend o\'chiq)' }));
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard-data`);
      setDashboardData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchStatus();
      fetchDashboardData();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    try {
      await axios.post(`${API_URL}/start`);
      fetchStatus();
    } catch (err) {
      alert("Xato yuz berdi!");
    }
  };

  const handleStop = async () => {
    try {
      await axios.post(`${API_URL}/stop`);
      fetchStatus();
    } catch (err) {
      alert("Xato yuz berdi!");
    }
  };

  const getLogClass = (msg) => {
    if (msg.includes('[-]')) return 'error';
    if (msg.includes('[+]')) return 'success';
    return 'info';
  };

  const getFlag = (lang) => {
    if (lang === 'uzb') return '🇺🇿 UZB';
    if (lang === 'rus') return '🇷🇺 RUS';
    if (lang === 'eng') return '🇺🇸 ENG';
    return lang ? `❓ ${lang.toUpperCase()}` : '⏳ Kutmoqda...';
  };

  return (
    <div className="dashboard-container">
      <div className="header">
        <h1>Render Server Boshqaruvi</h1>
        <div className={`status-badge ${state.isRunning ? 'active' : 'idle'}`}>
          <div className="dot"></div>
          {state.isRunning ? 'PROCESSING' : 'IDLE'}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Joriy Video</h3>
          <div className="value" style={{ fontSize: '24px' }}>
            {state.currentMovieCode || 'Yo\'q'}
          </div>
        </div>
        <div className="stat-card">
          <h3>AI Til Detektori</h3>
          <div className="value lang-badge">
            {getFlag(state.currentLanguage)}
          </div>
        </div>
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <h3>Holat</h3>
          <div style={{ fontSize: '18px', marginTop: '10px' }}>{state.status}</div>
          <div className="progress-wrapper">
            <div className="progress-fill" style={{ width: `${state.progress}%` }}></div>
          </div>
        </div>
      </div>

      <div className="controls">
        <button 
          className="btn-start" 
          onClick={handleStart} 
          disabled={state.isRunning}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Render Qilishni Boshlash
        </button>
        <button 
          className="btn-stop" 
          onClick={handleStop}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
          To'xtatish
        </button>
      </div>

      <div className="dashboard-panels">
        {/* Navbat */}
        <div className="panel">
          <h3>⏳ Navbat (Kutayotganlar - {dashboardData.pending.length})</h3>
          <div className="queue-list">
            {dashboardData.pending.length === 0 ? <p className="text-muted">Navbat bo'sh</p> : 
              dashboardData.pending.map((p, i) => (
                <div key={i} className="queue-item">
                  <span>🎬 {p.movie_code}</span>
                  <span className="queue-status">Kutmoqda</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Tayyor videolar galereyasi */}
        <div className="panel">
          <h3>✅ So'nggi Tayyor Videolar</h3>
          <div className="gallery-list">
            {dashboardData.recent.length === 0 ? <p className="text-muted">Hali videolar yo'q</p> :
              dashboardData.recent.map((r, i) => (
                <div key={i} className="gallery-item">
                  <div className="gallery-meta">
                    <strong>{r.movie_code}</strong>
                    <span className="success-text">Yakunlandi</span>
                  </div>
                  <div className="thumbnails">
                    {r.thumbnails && Array.isArray(r.thumbnails) ? (
                      r.thumbnails.map((img, idx) => (
                        <img key={idx} src={img} alt="thumbnail" />
                      ))
                    ) : (
                      <div className="no-thumb">Rasm yo'q</div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div className="log-container">
        {state.logs.map((log, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">[{new Date(log.time).toLocaleTimeString()}]</span>
            <span className={`log-msg ${getLogClass(log.message)}`}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
