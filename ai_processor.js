const ffmpeg = require('fluent-ffmpeg');
const { HfInference } = require('@huggingface/inference');
const fs = require('fs');
const path = require('path');

const hf = new HfInference(process.env.HF_ACCESS_TOKEN);

async function detectLanguage(videoPath) {
    console.log("[*] AI: Videodan audio qirqib olinmoqda (ilk 10 soniya)...");
    const audioPath = path.join(path.dirname(videoPath), `temp_audio_${Date.now()}.wav`);
    
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .setStartTime('00:00:10') // 10-soniyadan boshlab
            .setDuration(10)          // 10 soniyalik qism
            .output(audioPath)
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            .on('end', async () => {
                console.log("[*] AI: Audio olingach, Hugging Face modeliga yuborilmoqda...");
                try {
                    const audioBuffer = fs.readFileSync(audioPath);
                    
                    let langCode = 'uzb'; // Standart til
                    
                    try {
                        // Maxsus til aniqlovchi AI model
                        const langResult = await hf.audioClassification({
                            data: audioBuffer,
                            model: 'speechbrain/lang-id-voxlingua107-ecapa'
                        });
                        
                        if (langResult && langResult.length > 0) {
                            const topLang = langResult[0].label.toLowerCase(); 
                            if (topLang.includes('uz')) langCode = 'uzb';
                            else if (topLang.includes('ru')) langCode = 'rus';
                            else if (topLang.includes('en')) langCode = 'eng';
                        }
                    } catch (e) {
                        console.log("[-] AI LangDetect xato (standart uzb qo'yiladi):", e.message);
                    }

                    fs.unlinkSync(audioPath);
                    console.log(`[+] AI: Til muvaffaqiyatli aniqlandi -> ${langCode}`);
                    resolve(langCode);
                } catch (err) {
                    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    console.log("[-] AI Xato, standart 'uzb' qaytarilmoqda:", err.message);
                    resolve('uzb');
                }
            })
            .on('error', (err) => {
                console.log("[-] FFmpeg audio qirqish xatosi:", err.message);
                resolve('uzb');
            })
            .run();
    });
}

module.exports = { detectLanguage };
