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

        // Sanitize category name for filename
        const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const htmlFile = path.join(htmlOutDir, `${safeName}.html`);
        const pngFileName = `${safeName}.png`;
        const jpgFileName = `${safeName}.jpg`;
        const pngFileFull = path.join(imageOutDir, pngFileName);
        const jpgFileFull = path.join(imageOutDir, jpgFileName);

        // Normalize category name for matching
        const normCategory = category.toLowerCase().trim();
        const imageMap = {
            "ai": "photo-1677442136019-21780ecad995",
            "srd / xr": "photo-1622979135225-d2ba269cf1ac",
            "gaming monitor": "photo-1542744173-8e7e53415bb0",
            "production monitor": "photo-1551817150-13ced97858c1",
            "camera control": "photo-1516035069371-29a1b244cc32",
            "projector": "photo-1585771724684-38269d6639fd",
            "led wall display": "photo-1550745165-9bc0b252726f",
            "tv": "photo-1593359677879-a4bb92f829d1",
            "sony": "photo-1616423640778-28d1b53229bd",
            "tcl": "photo-1593784991095-a205069470b6"
        };
        const photoId = imageMap[normCategory] || "photo-1451187580459-43490279c0fa";
        const imageUrl = `https://images.unsplash.com/${photoId}?q=80&w=1920&h=1080&auto=format&fit=crop`;

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
            imageFile: pngFileName // Web uses high-res PNG
        });

        console.log(`Created HTML: ${htmlFile}`);
    }

    console.log('\nLaunching Puppeteer to capture slides...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    for (const item of filesToCapture) {
        console.log(`Capturing: ${item.category}`);
        await page.goto(`file://${item.htmlFile}`, { waitUntil: 'networkidle0' });

        // 1. Capture high-res PNG for Web
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
        await page.screenshot({ path: item.pngFile, type: 'png' });
        console.log(`Saved Web PNG: ${item.pngFile}`);

        // 2. Capture low-res JPG for Email
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        await page.screenshot({ path: item.jpgFile, type: 'jpeg', quality: 60 });
        console.log(`Saved Email JPG: ${item.jpgFile}`);
    }

    await browser.close();
    console.log('\nAll slides captured successfully.');

    // Generate index.html
    console.log('\nGenerating index.html gallery...');
    const indexTemplateString = fs.readFileSync(indexTemplateFile, 'utf-8');
    const indexContent = ejs.render(indexTemplateString, { slides: slidesForIndex });
    const indexOutFile = path.join(distDir, 'index.html');
    fs.writeFileSync(indexOutFile, indexContent, 'utf-8');
    console.log(`Saved index.html to ${indexOutFile}`);
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
