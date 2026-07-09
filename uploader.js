const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const s3 = new S3Client({
    region: process.env.B2_REGION,
    endpoint: `https://${process.env.B2_REGION}.backblazeb2.com`,
    credentials: {
        accessKeyId: process.env.B2_APPLICATION_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
    }
});

async function uploadToB2(filePath, fileName) {
    console.log(`[*] Yuklanmoqda B2 ga: ${fileName}...`);
    const fileStream = fs.createReadStream(filePath);
    const bucketName = process.env.B2_BUCKET_NAME;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: `file/${bucketName}/${fileName}`,
        Body: fileStream,
    });

    try {
        await s3.send(command);
        console.log(`[+] Yuklash yakunlandi: ${fileName}`);
        
        // Return CDN URL
        return `${process.env.CDN_URL}/file/${bucketName}/${fileName}`;
    } catch (err) {
        console.error(`[-] B2 ga yuklashda xato:`, err);
        throw err;
    }
}

module.exports = { uploadToB2 };
