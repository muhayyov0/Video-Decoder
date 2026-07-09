const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');
const http = require('http');

const AD_HOSTS = new Set([
    "popads.net", "popcash.net", "adcash.com", "exoclick.com",
    "trafficjunky.net", "juicyads.com", "adspyglass.com",
    "hilltopads.net", "propellerads.com", "clickadu.com",
    "adsterra.com", "bidvertiser.com", "monetag.com",
    "exosrv.com", "ad-maven.com", "a-ads.com",
    "onclickads.net", "trafmag.com", "owebpad.com",
    "g7nsw.com", "realsrv.com"
]);

const AD_KEYWORDS = ["popunder", "/pop/", "/ads/", "/ad/", "tracker.", "analytics.", "casino", "betting"];

function isAd(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        for (let d of AD_HOSTS) {
            if (host === d || host.endsWith("." + d)) return true;
        }
    } catch (e) {}
    const lower = url.toLowerCase();
    for (let kw of AD_KEYWORDS) {
        if (lower.includes(kw)) return true;
    }
    return false;
}

function isVideo(url) {
    const lower = url.toLowerCase();
    if (lower.includes("token=") && lower.includes("expiry=")) return true;
    if (lower.includes(".mp4") || lower.includes(".m3u8")) return true;
    return false;
}

function isInternal(url) {
    const lower = url.toLowerCase();
    return lower.includes("pass_md5") || lower.includes("cloudflare") ||
           lower.includes("/cdn-cgi/") || lower.includes("challenges.cloudflare");
}

async function extractVideoUrl(doodUrl) {
    const embedUrl = doodUrl.replace("doodstream.com/d/", "doodstream.com/e/")
                            .replace("dood.wf/d/", "dood.wf/e/")
                            .replace("dood.so/d/", "dood.so/e/")
                            .replace("dood.yt/d/", "dood.yt/e/")
                            .replace("dooood.com/d/", "dooood.com/e/");
                            
    console.log("[*] Brauzer ochilmoqda...");
    console.log("[*] Sahifa: " + embedUrl);

    let foundUrl = null;
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        viewport: { width: 412, height: 892 }
    });
    
    const page = await context.newPage();

    await page.route("**/*", (route) => {
        const url = route.request().url();
        if (isAd(url)) {
            route.abort();
            return;
        }
        if (!foundUrl && isVideo(url) && !isInternal(url)) {
            foundUrl = url;
            console.log("\n[+] VIDEO URL TOPILDI!");
            console.log("    " + url);
        }
        route.continue();
    });

    try {
        await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    } catch (e) {
        console.log("[-] goto xato (davom etamiz): " + e.message);
    }

    const jsCheck = `
        (function() {
            var els = document.querySelectorAll('video[src], source[src]');
            for (var i = 0; i < els.length; i++) {
                var s = els[i].getAttribute('src');
                if (s && s.indexOf('http') === 0) return s;
            }
            try {
                if (typeof jwplayer !== 'undefined') {
                    var item = jwplayer().getPlaylistItem(0);
                    if (item && item.file) return item.file;
                }
            } catch(e2) {}
            return null;
        })()
    `;

    for (let i = 0; i < 18; i++) {
        if (foundUrl) break;
        await new Promise(r => setTimeout(r, 1000));
        try {
            const jsUrl = await page.evaluate(jsCheck);
            if (jsUrl && isVideo(jsUrl) && !isInternal(jsUrl)) {
                foundUrl = jsUrl;
                console.log("\n[+] JS orqali topildi: " + jsUrl);
            }
        } catch (e) {}
    }

    await browser.close();
    return foundUrl;
}

function downloadVideo(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const requestModule = url.startsWith('https') ? https : http;
        
        const options = {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
                "Referer": "https://doodstream.com/",
                "Accept": "*/*"
            }
        };

        requestModule.get(url, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadVideo(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Server qaytardi: ${response.statusCode}`));
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(dest));
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

module.exports = { extractVideoUrl, downloadVideo };
