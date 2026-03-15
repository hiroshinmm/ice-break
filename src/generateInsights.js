const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

/**
 * Google NewsのリンクからオリジナルのURLを抽出する
 */
function decodeGoogleNewsUrl(encodedUrl) {
    if (!encodedUrl.includes('news.google.com')) return encodedUrl;
    try {
        const urlObj = new URL(encodedUrl);
        const pathParts = urlObj.pathname.split('/');
        const base64Str = pathParts.find(p => p.startsWith('CBM')) || pathParts[pathParts.length - 1];
        const actualBase64 = base64Str.startsWith('CBM') ? base64Str.substring(3) : base64Str;
        const buffer = Buffer.from(actualBase64, 'base64');
        const raw = buffer.toString('latin1');
        const start = raw.indexOf('http');
        if (start === -1) return encodedUrl;
        let url = '';
        for (let i = start; i < raw.length; i++) {
            const code = raw.charCodeAt(i);
            if (code < 32 || code > 126 || [34, 39, 60, 62].includes(code)) break;
            url += raw[i];
        }
        return url;
    } catch (e) {
        return encodedUrl;
    }
}

/**
 * オンラインでリダイレクトを追跡してURLを解決する
 */
async function resolveUrlOnline(googleUrl) {
    try {
        const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const response = await fetch(googleUrl, {
            method: 'GET',
            headers: { 'User-Agent': userAgent }
        });
        const text = await response.text();
        const nauMatch = text.match(/data-n-au="([^"]+)"/);
        if (nauMatch) return nauMatch[1];
        const pMatch = text.match(/data-p="([^"]+)"/);
        if (pMatch && pMatch[1].startsWith('http')) return pMatch[1];
        const refreshMatch = text.match(/url=(http[^"]+)"/i);
        if (refreshMatch) return refreshMatch[1];
        if (response.url && !response.url.includes('google.com')) return response.url;
        return googleUrl;
    } catch (e) {
        return googleUrl;
    }
}

/**
 * Puppeteerを使用してリダイレクトを完全に追跡する
 */
async function resolveUrlWithPuppeteer(googleUrl, browser) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
        await page.goto(googleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        try {
            await page.waitForFunction(() => !window.location.href.includes('google.com'), { timeout: 10000 });
        } catch (e) {}
        return page.url();
    } catch (e) {
        return googleUrl;
    } finally {
        if (page) await page.close();
    }
}

/**
 * 記事のHTMLからOG画像を抽出する
 */
async function fetchOgImage(url) {
    if (!url || url.includes('google.com')) return null;
    try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
        const text = await response.text();
        const ogImageMatch = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                             text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogImageMatch) return ogImageMatch[1];
        const twitterImageMatch = text.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                  text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
        return twitterImageMatch ? twitterImageMatch[1] : null;
    } catch (e) {
        return null;
    }
}

async function main() {
    if (!config.GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }

    const dataDir = path.join(__dirname, '..', 'data');
    const newsFile = path.join(dataDir, 'news.json');

    if (!fs.existsSync(newsFile)) {
        console.error('Error: news.json not found. Run fetchNews.js first.');
        process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

    console.log(`Using model: ${config.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const insights = {};

    // Puppeteerのブラウザを起動（選別された数件のために使用）
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (const [category, items] of Object.entries(newsData)) {
            console.log(`\nGenerating insight for category: ${category}`);

            if (!items || items.length === 0) {
                console.log(`No news found for ${category}. Skipping.`);
                insights[category] = null;
                continue;
            }

            const newsText = items.slice(0, 10).map((item, index) =>
                `[${index + 1}] Title: ${item.title}\nSource: ${item.source}\nLink: ${item.link}\nSnippet: ${item.snippet}\n`
            ).join('\n');

            const prompt = `
You are an expert AI assistant for Sony's display development software engineers.
Your task is to review the following recent news articles in the category "${category}" and pick ONE most interesting/important topic to present as an icebreak at a morning meeting.
If the news is not directly relevant to displays, cameras, XR, or technology, try to find the tech angle.

Output a valid JSON object with the following structure:
{
  "title": "A catchy, short title for the slide (Japanese, max 40 chars)",
  "summary": "A summary of the news (Japanese, around 150 characters, capturing the main points clearly)",
  "insight": "A deep insight 'INSIGHT' tailored for display software engineers. Why does this matter? What is the technical implication? (Japanese, 3-4 sentences)",
  "sourceUrl": "The exact URL of the picked article from the provided list",
  "sourceName": "The name of the source (e.g. 4Gamer, The Verge)"
}

Here are the recent news articles:
${newsText}
`;

            try {
                const result = await model.generateContent(prompt);
                const response = result.response;
                const jsonText = response.text();
                const parsed = JSON.parse(jsonText);

                // 最後に選ばれた1件のみ、リンクの解決と画像の再取得を行う
                let pickedItem = items.find(item => item.link === parsed.sourceUrl);
                if (!pickedItem) {
                    pickedItem = items[0];
                }

                // Google Newsリンクなら解決を試みる
                if (pickedItem.link.includes('news.google.com')) {
                    console.log(`Resolving picked article link: ${pickedItem.link.substring(0, 50)}...`);
                    let resolved = decodeGoogleNewsUrl(pickedItem.link);
                    if (resolved.includes('news.google.com')) {
                        resolved = await resolveUrlOnline(pickedItem.link);
                    }
                    if (resolved.includes('news.google.com')) {
                        resolved = await resolveUrlWithPuppeteer(pickedItem.link, browser);
                    }
                    pickedItem.link = resolved;
                    parsed.sourceUrl = resolved;
                }

                // 画像がない、またはリンクが解決された場合はOGP取得を試みる
                if (!pickedItem.imageUrl && !pickedItem.link.includes('google.com')) {
                    console.log(`Fetching OG image for: ${pickedItem.link.substring(0, 50)}...`);
                    pickedItem.imageUrl = await fetchOgImage(pickedItem.link);
                }

                if (pickedItem.imageUrl) {
                    parsed.originalImageUrl = pickedItem.imageUrl;
                }

                insights[category] = parsed;
                console.log(`Success: ${parsed.title}`);
            } catch (error) {
                console.error(`Error generating insight for ${category}:`, error.message);
                insights[category] = null;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
