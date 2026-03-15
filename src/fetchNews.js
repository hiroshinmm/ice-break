const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

/**
 * Google NewsのリンクからオリジナルのURLを抽出する（Base64デコード）
 */
function decodeGoogleNewsUrl(encodedUrl) {
    if (!encodedUrl.includes('news.google.com')) return encodedUrl;
    try {
        const urlObj = new URL(encodedUrl);
        const pathParts = urlObj.pathname.split('/');
        const base64Str = pathParts[pathParts.length - 1];

        // Base64デコード（binaryとして読み込む）
        const decoded = Buffer.from(base64Str, 'base64').toString('binary');
        const start = decoded.indexOf('http');
        if (start === -1) return encodedUrl;

        let url = decoded.substring(start);
        const match = url.match(/[^\x20-\x7E]/);
        if (match) {
            url = url.substring(0, match.index);
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
        const response = await fetch(googleUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const text = await response.text();
        const refreshMatch = text.match(/url=(http[^"]+)"/i);
        if (refreshMatch) return refreshMatch[1];
        const dataUrlMatch = text.match(/data-url="([^"]+)"/);
        if (dataUrlMatch) return dataUrlMatch[1];
        return response.url;
    } catch (e) {
        return googleUrl;
    }
}

/**
 * 記事のHTMLからOG画像を抽出する
 */
async function fetchOgImage(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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

async function fetchCategoryNews(urls, days) {
    let allItems = [];
    for (const url of urls) {
        try {
            const feed = await parser.parseURL(url);
            const recentItems = feed.items.filter(item => isRecent(item.isoDate || item.pubDate, days));
            
            for (const item of recentItems) {
                let link = item.link;
                if (link.includes('news.google.com')) {
                    link = decodeGoogleNewsUrl(link);
                    if (link.includes('news.google.com')) {
                        link = await resolveUrlOnline(link);
                    }
                }

                // Try to extract image URL from RSS
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

                // If no image in RSS, try scraping OG image from the resolved link
                if (!imageUrl && link && !link.includes('news.google.com')) {
                    imageUrl = await fetchOgImage(link);
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

    for (const [category, urls] of Object.entries(config.feeds)) {
        console.log(`Processing category: ${category}`);
        const items = await fetchCategoryNews(urls, config.DAYS_TO_FETCH);

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

        // Keep max 20 items per category to avoid overloading token limits
        results[category] = uniqueItems.slice(0, 20);
        console.log(`Found ${uniqueItems.length} recent news items for ${category}. Saving top ${results[category].length}.`);
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
