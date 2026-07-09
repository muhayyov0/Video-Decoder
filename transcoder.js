const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const RESOLUTIONS = [
    { name: '1080p', height: 1080, scale: 'scale=-2:1080' },
    { name: '720p', height: 720, scale: 'scale=-2:720' },
    { name: '480p', height: 480, scale: 'scale=-2:480' },
    { name: '360p', height: 360, scale: 'scale=-2:360' },
    { name: '244p', height: 244, scale: 'scale=-2:244' },
    { name: '144p', height: 144, scale: 'scale=-2:144' }
];

async function getVideoInfo(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            resolve({
                width: videoStream.width,
                height: videoStream.height,
                duration: metadata.format.duration
            });
        });
    });
}

async function transcodeVideo(inputPath, resolution, outputPath, langCode, posterPath) {
    return new Promise((resolve, reject) => {
        console.log(`[*] Transcoding to ${resolution.name} (Tili: ${langCode})...`);
        
        const watermarkFilter = `drawtext=text='Forever TV':fontcolor=white@0.5:fontsize=24:x=w-tw-20:y=20`;
        const videoFilter = `${resolution.scale},${watermarkFilter}`;
        
        let command = ffmpeg(inputPath);
        
        if (posterPath) {
            command = command.input(posterPath);
        }

        command
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-preset fast',
                '-crf 23',
                `-vf ${videoFilter}`,
                `-metadata:s:a:0 language=${langCode}`
            ]);

        if (posterPath) {
            command.outputOptions([
                '-map 0',
                '-map 1',
                '-c:v:1 copy',
                '-disposition:v:1 attached_pic'
            ]);
        }

        command
            .on('end', () => {
                console.log(`[+] Muvaffaqiyatli: ${resolution.name}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`[-] Xato ${resolution.name}:`, err);
                reject(err);
            })
            .save(outputPath);
    });
}

async function processVideo(inputFilePath, langCode = 'uzb', posterFile = null) {
    const info = await getVideoInfo(inputFilePath);
    console.log(`[*] Asl video formati: ${info.width}x${info.height}`);

    const originalHeight = info.height;
    const baseDir = path.dirname(inputFilePath);
    const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
    
    let generatedFiles = [];
    
    for (let res of RESOLUTIONS) {
        if (originalHeight >= (res.height - 50)) {
            const outPath = path.join(baseDir, `${baseName}_${res.name}.mkv`);
            await transcodeVideo(inputFilePath, res, outPath, langCode, posterFile);
            generatedFiles.push({
                resolution: res.name,
                path: outPath
            });
        }
    }
    
    return { generatedFiles, thumbFiles: [] };
}

module.exports = { processVideo, getVideoInfo };
