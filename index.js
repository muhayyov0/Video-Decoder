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
async function processNextVideo() {
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
            return false;
        }
        
        // Fagat 'dood' havolalari filtri
        const targetRow = mvideos.find(row => 
            (row.auto && row.auto.web && row.auto.web !== 'null' && row.auto.web.toLowerCase().includes('dood')) && 
            isNotProcessed(row, '144p')
        );
        
        if (!targetRow) {
            addLog("[!] Navbatda qayta ishlanadigan Doodstream videolari yo'q.", 'warning');
            serverState.currentStep = null;
            serverState.status = 'Kutmoqda...';
            return false;
        }
        
        const row = targetRow;
        serverState.currentMovieCode = row.movie_code;
        addLog(`[+] Video topildi: ${row.movie_code}`, 'success');
        
        let doodUrl = row.auto.web;
        
        // Step 1: Extract
        serverState.progress = 5;
        serverState.currentStep = 'extracting';
        const directUrl = await extractVideoUrl(doodUrl);
        if (!directUrl) throw new Error("Doodstream bypass xato (Link o'lgan yoki botdan himoya)");
        
        // Step 2: Download
        serverState.progress = 15;
        serverState.currentStep = 'downloading';
        const tmpFile = path.join(__dirname, `${row.movie_code}_temp.mp4`);
        await downloadVideo(directUrl, tmpFile);
        
        // Step 3: TMDb Poster
        serverState.progress = 35;
        let posterFile = null;
        const { data: details } = await supabase.from('mdetails').select('poster_url_16_9').eq('movie_code', row.movie_code).single();
        if (details && details.poster_url_16_9) {
            posterFile = path.join(__dirname, `${row.movie_code}_poster.jpg`);
            await downloadVideo(details.poster_url_16_9, posterFile);
        }

        // Step 4: AI Language Detection
        serverState.progress = 40;
        serverState.currentStep = 'detecting_lang';
        const langCode = await detectLanguage(tmpFile);
        serverState.currentLanguage = langCode;
        
        // Step 5: Transcode
        serverState.progress = 50;
        serverState.currentStep = 'transcoding';
        addLog(`[*] FFmpeg: Transcode (Tili: ${langCode}, +Watermark, +Embedded Poster)...`);
        const { generatedFiles } = await processVideo(tmpFile, langCode, posterFile);
        addLog(`[+] FFmpeg: ${generatedFiles.length} ta sifat yaratildi!`, 'success');
        
        // Step 6: Upload to B2
        serverState.progress = 75;
        serverState.currentStep = 'uploading';
        let updates = {};
        let thumbUrls = [];
        
        addLog("[*] ☁️ B2 bulutiga yuklanmoqda...");
        
        if (posterFile) {
            const fileName = `${row.movie_code}_thumb_${Date.now()}.jpg`;
            const cdnUrl = await uploadToB2(posterFile, fileName);
            thumbUrls.push(cdnUrl);
            fs.unlinkSync(posterFile);
        }
        
        if (thumbUrls.length > 0) updates['thumbnails'] = thumbUrls;
        
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
        
        // Step 7: Update DB
        serverState.progress = 95;
        serverState.currentStep = 'updating_db';
        addLog("[*] 💾 Ma'lumotlar bazasi yangilanmoqda...");
        
        const { error: dbError } = await supabase
            .from('mvideos')
            .update(updates)
            .eq('movie_code', row.movie_code);
            
        if (dbError) throw dbError;
        
        serverState.progress = 100;
        serverState.status = 'Tayyor!';
        serverState.totalProcessed++;
        
        const dur = Math.floor((Date.now() - jobStart) / 1000);
        addLog(`[+] 🎉 Barchasi tayyor! (${resNames.join(', ')}) | Vaqt: ${dur}s`, 'success');
        
        serverState.history.unshift({
            movieCode: row.movie_code,
            status: 'success',
            langCode: langCode,
            resolutions: resNames,
            duration: dur,
            time: new Date()
        });
        
        return true;

    } catch (err) {
        serverState.totalErrors++;
        addLog(`[-] ❌ Xato: ${err.message}`, 'error');
        serverState.status = 'Xatolik yuz berdi';
        serverState.history.unshift({
            movieCode: serverState.currentMovieCode || 'Noma\'lum',
            status: 'error',
            error: err.message,
            time: new Date()
        });
        return false;
    }
}

async function processQueueLoop() {
    if (serverState.isRunning) return;
    serverState.isRunning = true;
    serverState.isPaused = false;
    addLog("[*] 🚀 Navbat ishlashni boshladi.", 'success');
    
    while(serverState.isRunning) {
        if (serverState.isPaused) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }
        
        const didProcess = await processNextVideo();
        
        if (!didProcess) {
            addLog("[*] Kutish rejimi... (Yangi video qidirilmoqda)", 'info');
            serverState.status = "Kutmoqda...";
            for(let i=0; i<12; i++) {
                 if(!serverState.isRunning) break;
                 await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    addLog("[*] 🛑 Navbat to'liq to'xtatildi.", 'warning');
}

// ========== EXPRESS API ==========
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json(serverState);
});

app.get('/api/stats', async (req, res) => {
    try {
        const { data: mvideos, error } = await supabase.from('mvideos').select('*');
        if (error) throw error;
        
        let pending = [];
        let completed = [];
        
        for (let row of mvideos) {
            if (isNotProcessed(row, '144p') && row.auto && row.auto.web && row.auto.web.toLowerCase().includes('dood')) {
                pending.push({
                    movie_code: row.movie_code,
                    dood_url: row.auto?.web || null,
                    created_at: row.created_at
                });
            } else if (!isNotProcessed(row, '144p')) {
                completed.push({
                    movie_code: row.movie_code,
                    thumbnails: row.thumbnails || [],
                    resolutions: ['1080p','720p','480p','360p','244p','144p'].filter(r => row[r] && row[r].web && row[r].web !== 'null'),
                    created_at: row.created_at
                });
            }
        }
        
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

app.post('/api/start', (req, res) => {
    if (!serverState.isRunning) {
        processQueueLoop();
    } else if (serverState.isPaused) {
        serverState.isPaused = false;
        addLog("[*] ▶ Navbat pauzadan chiqdi va davom etmoqda.", 'success');
    }
    res.json({ success: true, message: "Started" });
});

app.post('/api/pause', (req, res) => {
    serverState.isPaused = true;
    addLog("[*] ⏸ Navbat pauza qilindi. (Hozirgi video tugagach kutib turadi)", 'warning');
    res.json({ success: true, message: "Paused" });
});

app.post('/api/stop', (req, res) => {
    serverState.isRunning = false;
    serverState.isPaused = false;
    res.json({ success: true, message: "Stopped" });
});

app.post('/api/clear-logs', (req, res) => {
    serverState.logs = [];
    addLog("[*] Loglar tozalandi.", 'info');
    res.json({ success: true });
});

const distPath = path.join(__dirname, 'dashboard', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'));
        }
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    addLog(`🚀 Forever Decoder API — Port: ${PORT}`);
});
