require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { extractVideoUrl, downloadVideo } = require('./extractor');
const { processVideo } = require('./transcoder');
const { uploadToB2 } = require('./uploader');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// State Management for the Dashboard
let serverState = {
    isRunning: false,
    status: 'Kutmoqda...',
    currentMovieCode: null,
    progress: 0,
    logs: []
};

let cronJob = null;

function addLog(msg) {
    console.log(msg);
    serverState.logs.unshift({ time: new Date().toISOString(), message: msg });
    if (serverState.logs.length > 100) serverState.logs.pop(); // faqat so'nggi 100 ta log
    serverState.status = msg;
}

function isNotProcessed(row, res) {
    if (!row[res]) return true;
    if (row[res] === null) return true;
    if (row[res].web === null || row[res].web === 'null') return true;
    return false;
}

async function processJob() {
    if (serverState.isRunning) return; // Prevent overlapping
    serverState.isRunning = true;
    serverState.progress = 0;
    serverState.currentMovieCode = null;

    try {
        addLog("[*] Jadval tekshirilmoqda...");
        
        const { data: mvideos, error } = await supabase
            .from('mvideos')
            .select('*');
            
        if (error) {
            addLog(`[-] Supabase xatosi: ${error.message}`);
            serverState.isRunning = false;
            return;
        }
        
        const targetRow = mvideos.find(row => 
            (row.auto && row.auto.web && row.auto.web !== 'null') && 
            isNotProcessed(row, '144p')
        );
        
        if (!targetRow) {
            addLog("[!] Navbatda qayta ishlanadigan videolar yo'q.");
            serverState.isRunning = false;
            serverState.status = 'Kutmoqda...';
            return;
        }
        
        const row = targetRow;
        serverState.currentMovieCode = row.movie_code;
        addLog(`[+] Video topildi: ${row.movie_code}`);
        
        let doodUrl = row.auto.web;
        addLog(`[*] Doodstream: ${doodUrl}`);
        
        serverState.progress = 10;
        
        const directUrl = await extractVideoUrl(doodUrl);
        if (!directUrl) throw new Error("Doodstream bypass xato (Link o'lgan yoki botdan himoya)");
        
        serverState.progress = 30;
        const tmpFile = path.join(__dirname, `${row.movie_code}_temp.mp4`);
        addLog("[*] Videofayl serverga yuklanmoqda...");
        await downloadVideo(directUrl, tmpFile);
        
        serverState.progress = 60;
        addLog("[*] FFmpeg Transcode jarayoni boshlandi...");
        const generated = await processVideo(tmpFile);
        
        serverState.progress = 80;
        let updates = {};
        
        addLog("[*] B2 bulutiga yuklanmoqda...");
        for (let item of generated) {
            const fileName = `${row.movie_code}_${Date.now()}_${item.resolution}.mkv`;
            const cdnUrl = await uploadToB2(item.path, fileName);
            updates[item.resolution] = { web: cdnUrl };
            fs.unlinkSync(item.path);
        }
        
        fs.unlinkSync(tmpFile);
        
        serverState.progress = 95;
        addLog("[*] Bazasi yangilanmoqda...");
        const { error: updErr } = await supabase
            .from('mvideos')
            .update(updates)
            .eq('movie_code', row.movie_code);
            
        if (updErr) {
            addLog(`[-] Baza yangilash xatosi: ${updErr.message}`);
        } else {
            addLog(`[+] Baza yangilandi! ${row.movie_code} muvaffaqiyatli yakunlandi.`);
        }
        
        serverState.progress = 100;
        
    } catch (err) {
        addLog(`[-] Xato yuz berdi: ${err.message}`);
    } finally {
        serverState.isRunning = false;
        if (serverState.progress === 100) {
             serverState.status = 'Kutmoqda...';
        }
    }
}

// ---- EXPRESS API ----
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json(serverState);
});

app.post('/api/start', (req, res) => {
    if (!cronJob) {
        cronJob = cron.schedule('0 * * * *', () => {
            processJob();
        });
        addLog("[*] Server yoqildi (Har soatlik tsikl boshlandi).");
    }
    // Hozirgi zaxotiyoq ishga tushirish
    if (!serverState.isRunning) {
        processJob();
    }
    res.json({ success: true, message: "Started" });
});

app.post('/api/stop', (req, res) => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        addLog("[*] Server va tsikl to'xtatildi.");
    }
    res.json({ success: true, message: "Stopped" });
});

const PORT = 5000;
app.listen(PORT, () => {
    addLog(`🚀 Express API server ishladi! Port: ${PORT}`);
});
