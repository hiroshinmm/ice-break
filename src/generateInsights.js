const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const { decodeGoogleNewsUrl, resolveUrlOnline } = require('./urlUtils');

// 複数の User-Agent を定義してランダム性を待たせる
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Gemini API リトライ付き生成
 */
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response;
        } catch (error) {
            const isRateLimit = error.message.includes('429') || error.message.toLowerCase().includes('rate limit');
            const isServerError = error.message.includes('500') || error.message.includes('503');
            
            if ((isRateLimit || isServerError) && i < maxRetries - 1) {
                const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
                console.log(`[Gemini] Retry ${i + 1}/${maxRetries} after ${Math.round(waitTime)}ms due to: ${error.message.substring(0, 50)}`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            throw error;
        }
    }
}

/**
 * Puppeteerを使用してリダイレクトを完全に追跡し、ページ内の主要な画像も探す
 */
async function resolveUrlWithPuppeteer(googleUrl, browser) {
    let page = null;
    try {
        page = await browser.newPage();
        // 自動化を検知されにくくするための設定
        await page.setUserAgent(getRandomUA());
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        });
        
        const targetUrl = googleUrl.includes('/rss/articles/')
            ? googleUrl.replace('/rss/articles/', '/articles/').replace(/\?.*$/, '')
            : googleUrl;
        
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        try {
            await page.waitForFunction(() => !window.location.href.includes('google.com'), { timeout: 15000 });
        } catch (e) {
            console.log(`[LOG] Puppeteer redirect wait timed out. Current URL: ${page.url().substring(0, 50)}...`);
        }

        const detectedImageUrl = await page.evaluate(() => {
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.content) return og.content;
            
            const tw = document.querySelector('meta[name="twitter:image"]');
            if (tw && tw.content) return tw.content;

            const ldTags = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const ld of ldTags) {
                try {
                    const data = JSON.parse(ld.innerText);
                    const findImage = (obj) => {
                        if (!obj) return null;
                        const isGood = (u) => u && typeof u === 'string' && !u.startsWith('data:') && !u.includes('gravatar') && !u.includes('avatar');
                        if (obj.image) {
                            const img = typeof obj.image === 'string' ? obj.image
                                : Array.isArray(obj.image) ? (typeof obj.image[0] === 'string' ? obj.image[0] : (obj.image[0] && obj.image[0].url))
                                : obj.image.url;
                            if (isGood(img)) return img;
                        }
                        if (isGood(obj.thumbnailUrl)) return obj.thumbnailUrl;
                        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                            for (const g of obj['@graph']) {
                                const found = findImage(g);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    const found = findImage(data);
                    if (found) return found;
                } catch(e) {}
            }

            const ampImg = document.querySelector('amp-img');
            if (ampImg && ampImg.src && !ampImg.src.startsWith('data:')) return ampImg.src;

            const contentArea = document.querySelector('article, .content, .post, .entry-content, .article-content, main');
            if (contentArea) {
                const imgs = Array.from(contentArea.querySelectorAll('img'))
                    .filter(img => {
                        const src = img.src || '';
                        const isVisible = img.offsetWidth > 10 && img.offsetHeight > 10;
                        const ratio = img.offsetWidth / img.offsetHeight;
                        return src.startsWith('http') && isVisible && ratio > 0.5 && ratio < 3.0;
                    })
                    .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
                if (imgs.length > 0) return imgs[0].src;
            }
            return null;
        });

        return { finalUrl: page.url(), detectedImageUrl };
    } catch (e) {
        return { finalUrl: googleUrl, detectedImageUrl: null };
    } finally {
        if (page) await page.close();
    }
}

/**
 * 記事のHTMLからOG画像を抽出する
 */
async function fetchOgImage(url, browser) {
    if (!url || url.includes('google.com')) return null;
    try {
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': getRandomUA(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': url 
            },
            signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
            const text = await response.text();
            let imgUrl = null;
            
            const ogImageMatch = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (ogImageMatch) imgUrl = ogImageMatch[1];
            
            if (imgUrl && !imgUrl.startsWith('data:')) {
                if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                else if (imgUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    imgUrl = urlObj.origin + imgUrl;
                }
                return imgUrl;
            }
        }
    } catch (e) {
        console.log(`[Image] Simple fetch failed for ${url.substring(0, 40)}: ${e.message}`);
    }

    if (browser) {
        console.log(`[Image] Falling back to Puppeteer: ${url.substring(0, 40)}...`);
        const result = await resolveUrlWithPuppeteer(url, browser);
        return result.detectedImageUrl;
    }
    return null;
}

async function main() {
    // 環境変数のバリデーション
    if (!config.GEMINI_API_KEY) {
        console.error('CRITICAL ERROR: GEMINI_API_KEY is not set.');
        process.exit(1);
    }

    const dataDir = path.join(__dirname, '..', 'data');
    const newsFile = path.join(dataDir, 'news.json');

    if (!fs.existsSync(newsFile)) {
        console.error('ERROR: news.json not found. Run fetchNews.js first.');
        process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

    console.log(`Using model: ${config.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        generationConfig: { responseMimeType: "application/json" }
    });

    const insights = {};

    // Puppeteerのブラウザを起動
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' // ボット検知回避の基本
        ]
    });

    try {
        const today = new Date().toLocaleDateString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-'); // YYYY-MM-DD
        
        const [year, month, day] = today.split('-');
        const archiveDir = path.join(dataDir, 'archives', year, month);
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

        const categoryEntries = Object.entries(newsData);
        const CONCURRENCY = 2;
        
        for (let i = 0; i < categoryEntries.length; i += CONCURRENCY) {
            const chunk = categoryEntries.slice(i, i + CONCURRENCY);
            
            await Promise.all(chunk.map(async ([category, items]) => {
                if (!items || items.length === 0) {
                    insights[category] = null;
                    return;
                }

                console.log(`[Insight] Processing: ${category} (${items.length} items)`);

                const newsText = items.slice(0, 10).map((item, index) =>
                    `[${index + 1}] Title: ${item.title}\nSource: ${item.source}\nLink: ${item.link}\nSnippet: ${item.snippet}\n`
                ).join('\n');

                const prompt = `
You are an expert AI assistant for software engineers.
Review news in "${category}" and pick ONE most important topic for a morning icebreak.
Output valid JSON:
{
  "title": "catchy short title (Japanese, max 40 chars)",
  "summary": "summary (Japanese, ~200 chars)",
  "insight": "tech insight for engineers (Japanese, 2-3 sentences)",
  "sourceUrl": "exact URL from the list",
  "sourceName": "source name"
}
Articles:
${newsText}
`;

                try {
                    const response = await generateContentWithRetry(model, prompt);
                    const parsed = JSON.parse(response.text());

                    let pickedItem = items.find(item => item.link === parsed.sourceUrl) || items[0];
                    const rssImageUrl = pickedItem.imageUrl;

                    if (pickedItem.link.includes('google.com')) {
                        let resolved = decodeGoogleNewsUrl(pickedItem.link);
                        if (resolved.includes('google.com')) {
                            resolved = await resolveUrlOnline(pickedItem.link);
                        }
                        if (resolved.includes('google.com')) {
                            const res = await resolveUrlWithPuppeteer(pickedItem.link, browser);
                            resolved = res.finalUrl;
                            if (res.detectedImageUrl) pickedItem.imageUrl = res.detectedImageUrl;
                        }
                        if (resolved && !resolved.includes('google.com')) {
                            pickedItem.link = resolved;
                            parsed.sourceUrl = resolved;
                        }
                    }

                    if (!pickedItem.imageUrl && !pickedItem.link.includes('google.com')) {
                        const ogImage = await fetchOgImage(pickedItem.link, browser);
                        if (ogImage) pickedItem.imageUrl = ogImage;
                    }

                    if (!pickedItem.imageUrl && rssImageUrl) {
                        pickedItem.imageUrl = rssImageUrl;
                    }

                    parsed.originalImageUrl = pickedItem.imageUrl || null;
                    parsed.originalImageArticleUrl = pickedItem.link;
                    parsed.displayDate = today; // アーカイブ用に日付を付与
                    
                    insights[category] = parsed;
                    console.log(`[Insight] Generated: ${parsed.title}`);
                } catch (error) {
                    console.error(`[Insight] Failed for ${category}:`, error.message);
                    insights[category] = null;
                }
            }));

            if (i + CONCURRENCY < categoryEntries.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // アーカイブファイルの保存
        const archiveFile = path.join(archiveDir, `${day}.json`);
        console.log(`[Archive] Saving to ${archiveFile}`);
        fs.writeFileSync(archiveFile, JSON.stringify(insights, null, 2), 'utf-8');

    } finally {
        await browser.close();
    }

    const outFile = path.join(dataDir, 'insights.json');
    fs.writeFileSync(outFile, JSON.stringify(insights, null, 2), 'utf-8');
    console.log(`\nSaved insights data to ${outFile}`);
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
