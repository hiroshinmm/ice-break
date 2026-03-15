const Parser = require('rss-parser');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/rss+xml, application/rdf+xml;q=0.8, application/xml;q=0.6, text/xml;q=0.6, */*;q=0.1'
    },
    customFields: {
        item: [
            ['media:content', 'mediaContent', { keepArray: true }],
            ['media:thumbnail', 'mediaThumbnail'],
            ['image', 'image']
        ]
    }
});

const isRecent = (dateStr, days) => {
    if (!dateStr) return false;
    const pubDate = new Date(dateStr);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return pubDate >= cutoff;
};

/**
 * Google NewsのリンクからオリジナルのURLを抽出する
 * 従来のBase64に加え、バイナリデータ内を検索する堅牢な方式を採用
 */
function decodeGoogleNewsUrl(encodedUrl) {
    if (!encodedUrl.includes('news.google.com')) return encodedUrl;
    try {
        const urlObj = new URL(encodedUrl);
        const pathParts = urlObj.pathname.split('/');
        // 最初の長い文字列（CBM...）を探す
        const base64Str = pathParts.find(p => p.startsWith('CBM')) || pathParts[pathParts.length - 1];
        
        // Base64デコード。CBMプレフィックスがある場合は除外
        const actualBase64 = base64Str.startsWith('CBM') ? base64Str.substring(3) : base64Str;
        const buffer = Buffer.from(actualBase64, 'base64');
        
        // バイナリデータ内をlatin1として読み込み、'http'を探す（Protobuf等への対応）
        const raw = buffer.toString('latin1');
        const start = raw.indexOf('http');
        if (start === -1) return encodedUrl;

        let url = '';
        for (let i = start; i < raw.length; i++) {
            const code = raw.charCodeAt(i);
            // URLとして不適切な文字、または非表示文字で停止
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

        // data-n-au (New Google News format)
        const nauMatch = text.match(/data-n-au="([^"]+)"/);
        if (nauMatch) return nauMatch[1];

        // data-p
        const pMatch = text.match(/data-p="([^"]+)"/);
        if (pMatch && pMatch[1].startsWith('http')) return pMatch[1];

        // Meta refresh
        const refreshMatch = text.match(/url=(http[^"]+)"/i);
        if (refreshMatch) return refreshMatch[1];
        
        // Fallback to response.url if it looks like a real article
        if (response.url && !response.url.includes('google.com')) return response.url;

        return googleUrl;
    } catch (e) {
        return googleUrl;
    }
}

/**
 * Puppeteerを使用してリダイレクトを完全に追跡し、最終的なURLを取得する
 */
async function resolveUrlWithPuppeteer(googleUrl, browser) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
        
        // Wait for navigation and potential redirects
        await page.goto(googleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Google Newsのリダイレクトはページ内JSで行われることがあるため、URLが変わるのを待つ
        try {
            await page.waitForFunction(() => !window.location.href.includes('google.com'), { timeout: 10000 });
        } catch (e) {
            // Timeout if it doesn't redirect, but we'll still take the current URL
        }

        const finalUrl = page.url();
        return finalUrl;
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
        const response = await fetch(url, {
            headers: { 'User-Agent': userAgent }
        });
        const text = await response.text();
        const ogImageMatch = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                             text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogImageMatch) return ogImageMatch[1];

        const twitterImageMatch = text.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                  text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
        if (twitterImageMatch) return twitterImageMatch[1];

        return null;
    } catch (e) {
        return null;
    }
}

async function fetchCategoryNews(urls, days, browser) {
    let allItems = [];
    for (const url of urls) {
        try {
            const feed = await parser.parseURL(url);
            const recentItems = feed.items.filter(item => isRecent(item.isoDate || item.pubDate, days));
            
            for (const item of recentItems) {
                let link = item.link;
                if (link.includes('news.google.com')) {
                    // 高速な解決ロジックのみをループ内で実行
                    const decoded = decodeGoogleNewsUrl(link);
                    if (decoded && !decoded.includes('news.google.com')) {
                        link = decoded;
                    } else {
                        link = await resolveUrlOnline(link);
                    }
                }

                // ループ内ではRSSからの画像抽出のみを行い、スクレイピング（fetchOgImage）は後回しにする
                let imageUrl = null;
                if (item.enclosure && item.enclosure.url) {
                    imageUrl = item.enclosure.url;
                } else if (item.mediaContent && item.mediaContent[0] && item.mediaContent[0].$) {
                    imageUrl = item.mediaContent[0].$.url;
                } else if (item.mediaThumbnail && item.mediaThumbnail.$) {
                    imageUrl = item.mediaThumbnail.$.url;
                } else if (item.image) {
                    imageUrl = typeof item.image === 'string' ? item.image : (item.image.url || null);
                }

                allItems.push({
                    title: item.title,
                    link: link,
                    pubDate: item.isoDate || item.pubDate,
                    source: feed.title || new URL(url).hostname,
                    imageUrl: imageUrl,
                    snippet: item.contentSnippet || item.content || ''
                });
            }
        } catch (error) {
            console.error(`Error fetching ${url}:`, error.message);
        }
    }
    return allItems;
}

async function main() {
    console.log('Fetching news...');
    const results = {};

    // 解決の確実性を高めるため、Puppeteerのブラウザを1つ起動して使い回す
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (const [category, urls] of Object.entries(config.feeds)) {
            console.log(`Processing category: ${category}`);
            const items = await fetchCategoryNews(urls, config.DAYS_TO_FETCH, browser);

            // Sort by date (newest first)
            items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

            // Remove duplicates based on link or title
            const uniqueItems = [];
            const seenLinks = new Set();
            const seenTitles = new Set();
            for (const item of items) {
                if (!seenLinks.has(item.link) && !seenTitles.has(item.title)) {
                    uniqueItems.push(item);
                    seenLinks.add(item.link);
                    seenTitles.add(item.title);
                }
            }

            // 選別された上位アイテムのみ、重い解決処理（Puppeteer / OG Image抽出）を実行する
            const topItems = uniqueItems.slice(0, 20);
            console.log(`Processing deep resolution for top ${topItems.length} items in ${category}...`);
            
            for (const item of topItems) {
                // まだGoogle Newsリンクのままなら、Puppeteerで解決を試みる
                if (item.link.includes('news.google.com')) {
                    item.link = await resolveUrlWithPuppeteer(item.link, browser);
                }
                
                // 画像がない場合はOGPスクレイピングを試みる
                if (!item.imageUrl && item.link && !item.link.includes('google.com')) {
                    item.imageUrl = await fetchOgImage(item.link);
                }
            }

            results[category] = topItems;
            console.log(`Found ${uniqueItems.length} recent news items for ${category}. Saved top ${results[category].length}.`);
        }
    } finally {
        await browser.close();
    }

    const outDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outFile = path.join(outDir, 'news.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nSaved news data to ${outFile}`);
    process.exit(0); // Add explicit exit to prevent GitHub Actions from hanging
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
