require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { extractVideoUrl, downloadVideo } = require('./extractor');
const { processVideo } = require('./transcoder');
const { uploadToB2 } = require('./uploader');
const { detectLanguage } = require('./ai_processor');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ========== STATE MANAGEMENT ==========
const startedAt = new Date();

let serverState = {
    isRunning: false,
    cronActive: false,
    status: 'Kutmoqda...',
    currentMovieCode: null,
    currentLanguage: null,
    currentStep: null, // 'extracting', 'downloading', 'detecting_lang', 'transcoding', 'uploading', 'updating_db'
    progress: 0,
    logs: [],
    history: [],    // So'nggi 20 ta bajarilgan videolar tarixi
    totalProcessed: 0,
    totalErrors: 0,
    serverUptime: startedAt.toISOString()
};

let cronJob = null;

function addLog(msg, level = 'info') {
    const entry = { time: new Date().toISOString(), message: msg, level };
    console.log(msg);
    serverState.logs.unshift(entry);
    if (serverState.logs.length > 200) serverState.logs = serverState.logs.slice(0, 200);
    serverState.status = msg;
}

function addHistory(movieCode, status, langCode, resolutions, duration) {
    serverState.history.unshift({
        movieCode,
        status,
        langCode,
        resolutions,
        duration,
        completedAt: new Date().toISOString()
    });
    if (serverState.history.length > 20) serverState.history = serverState.history.slice(0, 20);
}

function isNotProcessed(row, res) {
    if (!row[res]) return true;
    if (row[res] === null) return true;
    if (row[res].web === null || row[res].web === 'null') return true;
    return false;
}

// ========== MAIN PROCESS ==========
async function processJob() {
    if (serverState.isRunning) return;
    serverState.isRunning = true;
    serverState.progress = 0;
    serverState.currentMovieCode = null;
    serverState.currentLanguage = null;
    serverState.currentStep = null;
    const jobStart = Date.now();

    try {
        serverState.currentStep = 'checking';
        addLog("[*] Jadval tekshirilmoqda...");
        
        const { data: mvideos, error } = await supabase
            .from('mvideos')
            .select('*');
            
        if (error) {
            addLog(`[-] Supabase xatosi: ${error.message}`, 'error');
            serverState.isRunning = false;
            return;
        }
        
        const targetRow = mvideos.find(row => 
            (row.auto && row.auto.web && row.auto.web !== 'null') && 
            isNotProcessed(row, '144p')
        );
        
        if (!targetRow) {
            addLog("[!] Navbatda qayta ishlanadigan videolar yo'q.", 'warning');
            serverState.isRunning = false;
            serverState.currentStep = null;
            serverState.status = 'Kutmoqda...';
            return;
        }
        
        const row = targetRow;
        serverState.currentMovieCode = row.movie_code;
        addLog(`[+] Video topildi: ${row.movie_code}`, 'success');
        
        let doodUrl = row.auto.web;
        addLog(`[*] Doodstream: ${doodUrl}`);
        
        // Step 1: Extract
        serverState.progress = 5;
        serverState.currentStep = 'extracting';
        addLog("[*] Doodstream havolasi chiqarilmoqda...");
        const directUrl = await extractVideoUrl(doodUrl);
        if (!directUrl) throw new Error("Doodstream bypass xato (Link o'lgan yoki botdan himoya)");
        
        // Step 2: Download
        serverState.progress = 15;
        serverState.currentStep = 'downloading';
        const tmpFile = path.join(__dirname, `${row.movie_code}_temp.mp4`);
        addLog("[*] Videofayl serverga yuklanmoqda...");
        await downloadVideo(directUrl, tmpFile);
        addLog("[+] Video muvaffaqiyatli yuklandi!", 'success');
        
        // Step 3: AI Language Detection
        serverState.progress = 40;
        serverState.currentStep = 'detecting_lang';
        addLog("[*] 🤖 AI: Tilni aniqlash jarayoni boshlandi...");
        const langCode = await detectLanguage(tmpFile);
        serverState.currentLanguage = langCode;
        addLog(`[+] 🤖 AI: Til aniqlandi -> ${langCode.toUpperCase()}`, 'success');
        
        // Step 4: Transcode
        serverState.progress = 50;
        serverState.currentStep = 'transcoding';
        addLog(`[*] FFmpeg: Transcode (Tili: ${langCode}, +Watermark, +Thumbnails)...`);
        const { generatedFiles, thumbFiles } = await processVideo(tmpFile, langCode);
        addLog(`[+] FFmpeg: ${generatedFiles.length} ta sifat yaratildi!`, 'success');
        
        // Step 5: Upload to B2
        serverState.progress = 75;
        serverState.currentStep = 'uploading';
        let updates = {};
        let thumbUrls = [];
        
        addLog("[*] ☁️ B2 bulutiga yuklanmoqda...");
        
        for (let t of thumbFiles) {
            const fileName = `${row.movie_code}_thumb_${Date.now()}_${path.basename(t)}`;
            const cdnUrl = await uploadToB2(t, fileName);
            thumbUrls.push(cdnUrl);
            fs.unlinkSync(t);
        }
        if (thumbUrls.length > 0) {
            updates['thumbnails'] = thumbUrls;
        }
        
        const resNames = [];
        for (let item of generatedFiles) {
            const fileName = `${row.movie_code}_${Date.now()}_${item.resolution}.mkv`;
            const cdnUrl = await uploadToB2(item.path, fileName);
            updates[item.resolution] = { web: cdnUrl };
            resNames.push(item.resolution);
            fs.unlinkSync(item.path);
        }
        addLog(`[+] ☁️ Barcha fayllar B2 ga yuklandi!`, 'success');
        
        fs.unlinkSync(tmpFile);
        
        // Step 6: Update DB
        serverState.progress = 90;
        serverState.currentStep = 'updating_db';
        addLog("[*] 📦 Baza yangilanmoqda...");
        const { error: updErr } = await supabase
            .from('mvideos')
            .update(updates)
            .eq('movie_code', row.movie_code);
            
        if (updErr) {
            addLog(`[-] Baza yangilash xatosi: ${updErr.message}`, 'error');
            serverState.totalErrors++;
        } else {
            const duration = Math.round((Date.now() - jobStart) / 1000);
            addLog(`[+] ✅ ${row.movie_code} — ${duration}s da yakunlandi!`, 'success');
            serverState.totalProcessed++;
            addHistory(row.movie_code, 'success', langCode, resNames, duration);
        }
        
        serverState.progress = 100;
        
    } catch (err) {
        addLog(`[-] ❌ Xato: ${err.message}`, 'error');
        serverState.totalErrors++;
        const duration = Math.round((Date.now() - jobStart) / 1000);
        addHistory(serverState.currentMovieCode || '?', 'error', null, [], duration);
    } finally {
        serverState.isRunning = false;
        serverState.currentStep = null;
        if (serverState.progress === 100) {
            serverState.status = 'Kutmoqda...';
            serverState.currentLanguage = null;
        }
    }
}

// ========== EXPRESS API ==========
const app = express();
app.use(cors());
app.use(express.json());

// Server holati
app.get('/api/status', (req, res) => {
    res.json(serverState);
});

// Dashboard uchun to'liq statistika
app.get('/api/stats', async (req, res) => {
    try {
        const { data: mvideos, error } = await supabase.from('mvideos').select('*');
        if (error) throw error;
        
        let pending = [];
        let completed = [];
        
        for (let row of mvideos) {
            if (isNotProcessed(row, '144p')) {
                pending.push({
                    movie_code: row.movie_code,
                    dood_url: row.auto?.web || null,
                    created_at: row.created_at
                });
            } else {
                completed.push({
                    movie_code: row.movie_code,
                    thumbnails: row.thumbnails || [],
                    resolutions: ['1080p','720p','480p','360p','244p','144p'].filter(r => row[r] && row[r].web && row[r].web !== 'null'),
                    created_at: row.created_at
                });
            }
        }
        
        pending.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        completed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({
            totalVideos: mvideos.length,
            totalPending: pending.length,
            totalCompleted: completed.length,
            totalProcessed: serverState.totalProcessed,
            totalErrors: serverState.totalErrors,
            pending: pending.slice(0, 20),
            completed: completed.slice(0, 6),
            history: serverState.history,
            uptime: startedAt.toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Renderni boshlash
app.post('/api/start', (req, res) => {
    if (!cronJob) {
        cronJob = cron.schedule('0 * * * *', () => {
            processJob();
        });
        serverState.cronActive = true;
        addLog("[*] ⏰ Server yoqildi (Har soatlik tsikl boshlandi).", 'success');
    }
    if (!serverState.isRunning) {
        processJob();
    }
    res.json({ success: true, message: "Started" });
});

// Renderni to'xtatish
app.post('/api/stop', (req, res) => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        serverState.cronActive = false;
        addLog("[*] 🛑 Server va tsikl to'xtatildi.", 'warning');
    }
    res.json({ success: true, message: "Stopped" });
});

// Bitta videoni qo'lda ishga tushirish
app.post('/api/process-now', (req, res) => {
    if (serverState.isRunning) {
        return res.json({ success: false, message: "Allaqachon ishlayapti" });
    }
    processJob();
    res.json({ success: true, message: "Jarayon boshlandi" });
});

// Loglarni tozalash
app.post('/api/clear-logs', (req, res) => {
    serverState.logs = [];
    addLog("[*] Loglar tozalandi.", 'info');
    res.json({ success: true });
});

const PORT = 5000;
app.listen(PORT, () => {
    addLog(`🚀 Forever Decoder API — Port: ${PORT}`);
});
