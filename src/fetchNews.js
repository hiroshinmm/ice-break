const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/rdf+xml;q=0.8, application/xml;q=0.6, text/xml;q=0.6, */*;q=0.1'
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
            allItems.push(...recentItems.map(item => ({
                title: item.title,
                link: item.link,
                pubDate: item.isoDate || item.pubDate,
                source: feed.title || new URL(url).hostname,
                snippet: item.contentSnippet || item.content || ''
            })));
        } catch (error) {
            console.error(`Error fetching ${url}:`, error.message);
            // Skip this feed and continue parsing others
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
