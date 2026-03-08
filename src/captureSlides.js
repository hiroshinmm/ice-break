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

    // We need placeholder images for now if we didn't generate them via DALL-E yet.
    // We'll use Unsplash source with keywords.
    // Once the DALL-E or Gemini Image generation is live, we would use those URLs.

    console.log('Generating HTML slides...');
    const filesToCapture = [];
    const slidesForIndex = [];

    for (const [category, insight] of Object.entries(insightsData)) {
        if (!insight) continue;

        // Sanitize category name for filename
        const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const htmlFile = path.join(htmlOutDir, `${safeName}.html`);
        const imgFileName = `${safeName}.png`;
        const imgFileFull = path.join(imageOutDir, imgFileName);

        // Use a placeholder image based on the category for the visual
        const query = encodeURIComponent(category.split('/')[0].trim());
        const imageUrl = `https://source.unsplash.com/1920x1080/?technology,${query}`;

        const htmlContent = ejs.render(templateString, {
            category: category,
            insight: insight,
            imageUrl: imageUrl
        });

        fs.writeFileSync(htmlFile, htmlContent, 'utf-8');
        filesToCapture.push({ category, htmlFile, imgFile: imgFileFull });

        slidesForIndex.push({
            category: category,
            title: insight.title,
            summary: insight.summary,
            sourceName: insight.sourceName,
            sourceUrl: insight.sourceUrl,
            imageFile: imgFileName
        });

        console.log(`Created HTML: ${htmlFile}`);
    }

    console.log('\nLaunching Puppeteer to capture slides...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 }); // High res

    for (const item of filesToCapture) {
        console.log(`Capturing: ${item.category}`);
        await page.goto(`file://${item.htmlFile}`, { waitUntil: 'networkidle0' });
        await page.screenshot({ path: item.imgFile, type: 'png' });
        console.log(`Saved image: ${item.imgFile}`);
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
