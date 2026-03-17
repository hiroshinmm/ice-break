const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { decodeGoogleNewsUrl, resolveUrlOnline } = require('./urlUtils');

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

async function fetchCategoryNews(urls, days) {
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

        // Keep top 20 items per category
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
