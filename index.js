require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { extractVideoUrl, downloadVideo } = require('./extractor');
const { processVideo } = require('./transcoder');
const { uploadToB2 } = require('./uploader');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function isNotProcessed(row, res) {
    if (!row[res]) return true;
    if (row[res] === null) return true;
    if (row[res].web === null || row[res].web === 'null') return true;
    return false;
}

async function processJob() {
    console.log("[*] mvideos jadvalidan yangi videolar tekshirilmoqda...");
    
    // Barcha videolarni olib JS ichida filtrlaymiz (aniqroq bo'lishi uchun)
    const { data: mvideos, error } = await supabase
        .from('mvideos')
        .select('*');
        
    if (error) {
        console.error("[-] Supabase xatosi:", error);
        return;
    }
    
    // Process qilinmagan (ya'ni 144p dagi link null yoki "null" bo'lgan) videoni topish
    const targetRow = mvideos.find(row => 
        (row.auto && row.auto.web && row.auto.web !== 'null') && 
        isNotProcessed(row, '144p')
    );
    
    if (!targetRow) {
        console.log("[!] Navbatda qayta ishlanadigan videolar yo'q.");
        return;
    }
    
    const row = targetRow;
    console.log(`[+] Video topildi: ${row.movie_code}`);
    
    let doodUrl = row.auto.web;
    
    console.log("[*] Doodstream URL:", doodUrl);
    
    try {
        const directUrl = await extractVideoUrl(doodUrl);
        if (!directUrl) throw new Error("Direct URL topilmadi (Doodstream bypass muvaffaqiyatsiz bo'ldi)!");
        
        const tmpFile = path.join(__dirname, `${row.movie_code}_temp.mp4`);
        console.log("[*] Video serverga yuklanmoqda...");
        await downloadVideo(directUrl, tmpFile);
        console.log("[+] Video muvaffaqiyatli yuklandi:", tmpFile);
        
        console.log("[*] FFmpeg orqali sifatini tushirish (Transcode) jarayoni boshlandi...");
        const generated = await processVideo(tmpFile);
        
        let updates = {};
        
        console.log("[*] Yaratilgan fayllar B2 bulutiga yuklanmoqda...");
        for (let item of generated) {
            const fileName = `${row.movie_code}_${Date.now()}_${item.resolution}.mkv`;
            const cdnUrl = await uploadToB2(item.path, fileName);
            updates[item.resolution] = { web: cdnUrl };
            
            // Xotirani tozalash (local faylni o'chirish)
            fs.unlinkSync(item.path);
        }
        
        // Asl vaqtinchalik faylni o'chirish
        fs.unlinkSync(tmpFile);
        
        console.log("[*] Supabase bazasi yangilanmoqda...", updates);
        const { error: updErr } = await supabase
            .from('mvideos')
            .update(updates)
            .eq('movie_code', row.movie_code);
            
        if (updErr) {
            console.error("[-] Bazani yangilashda xatolik:", updErr);
        } else {
            console.log("[+] Baza muvaffaqiyatli yangilandi! Barcha jarayon yakunlandi.");
        }
        
    } catch (err) {
        console.error("[-] Xato yuz berdi:", err);
    }
}

// Har soatda avtomatik tekshirish
cron.schedule('0 * * * *', () => {
    processJob();
});

console.log("Render Server ishga tushdi. Navbatdagi videoni tekshiraman...");
// Test uchun hozir bir marta ishga tushiramiz
processJob();
