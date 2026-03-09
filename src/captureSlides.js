const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const config = require('./config');

async function main() {
    const dataDir = path.join(__dirname, '..', 'data');
    const insightsFile = path.join(dataDir, 'insights.json');
    const templateFile = path.join(__dirname, 'templates', 'slide.ejs');
    const indexTemplateFile = path.join(__dirname, 'templates', 'index.ejs');
    const distDir = path.join(__dirname, '..', 'dist');
    const htmlOutDir = path.join(distDir, 'html');
    const imageOutDir = path.join(distDir, 'images');

    if (!fs.existsSync(insightsFile)) {
        console.error('Error: insights.json not found. Run generateInsights.js first.');
        process.exit(1);
    }

    const insightsData = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));

    if (!fs.existsSync(htmlOutDir)) fs.mkdirSync(htmlOutDir, { recursive: true });
    if (!fs.existsSync(imageOutDir)) fs.mkdirSync(imageOutDir, { recursive: true });

    const templateString = fs.readFileSync(templateFile, 'utf-8');

    console.log('Generating HTML slides...');
    const filesToCapture = [];
    const slidesForIndex = [];

    for (const [category, insight] of Object.entries(insightsData)) {
        if (!insight) continue;

        const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const htmlFile = path.join(htmlOutDir, `${safeName}.html`);
        const pngFileName = `${safeName}.png`;
        const jpgFileName = `${safeName}.jpg`;
        const pngFileFull = path.join(imageOutDir, pngFileName);
        const jpgFileFull = path.join(imageOutDir, jpgFileName);

        // Dynamic Keyword Search Strategy
        // Extract 2-3 main keywords from imagePrompt or use category as fallback
        let keywords = category;
        if (insight.imagePrompt) {
            keywords = insight.imagePrompt
                .split(',')
                .slice(0, 3) // Take first 3 descriptive segments
                .join(',')
                .replace(/no text|8k|resolution|hyper-realistic/gi, '') // Remove technical jargon
                .trim();
        }

        // Use Unsplash Source for keyword-based random images
        const imageUrl = `https://source.unsplash.com/featured/1920x1080/?${encodeURIComponent(keywords)}`;

        console.log(`[DEBUG] Category: "${category}" -> Search Keywords: "${keywords}" -> URL: ${imageUrl}`);

        const htmlContent = ejs.render(templateString, {
            category: category,
            insight: insight,
            imageUrl: imageUrl
        });

        fs.writeFileSync(htmlFile, htmlContent, 'utf-8');
        filesToCapture.push({ category, htmlFile, pngFile: pngFileFull, jpgFile: jpgFileFull });

        slidesForIndex.push({
            category: category,
            title: insight.title,
            summary: insight.summary,
            sourceName: insight.sourceName,
            sourceUrl: insight.sourceUrl,
            imageFile: pngFileName
        });
    }

    console.log('\nLaunching Puppeteer to capture slides...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });

    const page = await browser.newPage();

    for (const item of filesToCapture) {
        console.log(`Capturing: ${item.category}`);
        await page.goto(`file://${item.htmlFile}`, { waitUntil: 'networkidle0' });

        // Ensure images are fully loaded before screenshot
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return;
                return new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; // resolve anyway
                    // Set timeout in case it hangs
                    setTimeout(resolve, 5000);
                });
            }));
        });

        // Extra buffer for rendering
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Web PNG (High Res)
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
        await page.screenshot({ path: item.pngFile, type: 'png' });

        // 2. Email JPG (Standard Res)
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        await page.screenshot({ path: item.jpgFile, type: 'jpeg', quality: 60 });

        console.log(`Saved: ${item.category} (PNG & JPG)`);
    }

    await browser.close();

    console.log('\nGenerating index.html gallery...');
    const indexTemplateString = fs.readFileSync(indexTemplateFile, 'utf-8');
    const indexContent = ejs.render(indexTemplateString, { slides: slidesForIndex });
    fs.writeFileSync(path.join(distDir, 'index.html'), indexContent, 'utf-8');

    console.log('Process completed.');
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
