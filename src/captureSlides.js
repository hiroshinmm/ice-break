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

        // Image Selection Logic: Prioritize original image from news site, fallback to local default icon.
        let imageUrl = insight.originalImageUrl;
        let isDefaultImage = false;
        if (imageUrl) {
            console.log(`[INFO] Category: "${category}" -> Original image found. Using: "${imageUrl.substring(0, 60)}..."`);
        } else {
            // Using the user-selected default icon
            const defaultIconPath = path.resolve(__dirname, 'assets', 'default_news.png');
            imageUrl = `file://${defaultIconPath}`;
            isDefaultImage = true;
            console.log(`[INFO] Category: "${category}" -> No original image. Using local default icon.`);
        }

        const htmlContent = ejs.render(templateString, {
            category: category,
            insight: insight,
            imageUrl: imageUrl,
            isDefaultImage: isDefaultImage
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
    // Set a realistic User-Agent to avoid bot detection when loading news images
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (const item of filesToCapture) {
        console.log(`Capturing: ${item.category}`);
        // Reset timeout to 30s as we use existing images
        await page.goto(`file://${item.htmlFile}`, { waitUntil: 'networkidle2', timeout: 30000 });

        // Ensure images are fully loaded before screenshot
        await page.evaluate(async () => {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return;
                return new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve; // resolve anyway
                    setTimeout(resolve, 5000); // 5s wait is enough for local/pre-fetched images
                });
            }));
        });

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
