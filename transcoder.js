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
                height: videoStream.height
            });
        });
    });
}

async function transcodeVideo(inputPath, resolution, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`[*] Transcoding to ${resolution.name}...`);
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-preset fast',
                '-crf 23',
                `-vf ${resolution.scale}`
            ])
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

async function processVideo(inputFilePath) {
    const info = await getVideoInfo(inputFilePath);
    console.log(`[*] Asl video formati: ${info.width}x${info.height}`);

    const originalHeight = info.height;
    const baseDir = path.dirname(inputFilePath);
    const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
    
    let generatedFiles = [];
    
    for (let res of RESOLUTIONS) {
        // Only transcode if the original height is >= this resolution's height
        // Or if it's the closest one, we still process it
        if (originalHeight >= (res.height - 50)) {
            const outPath = path.join(baseDir, `${baseName}_${res.name}.mkv`);
            await transcodeVideo(inputFilePath, res, outPath);
            generatedFiles.push({
                resolution: res.name,
                path: outPath
            });
        }
    }
    
    return generatedFiles;
}

module.exports = { processVideo, getVideoInfo };
