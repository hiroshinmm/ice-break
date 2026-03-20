const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * 画像URLからファイルをダウンロードして指定パスに保存する
 */
async function downloadImageToFile(imageUrl, articleUrl, destPath) {
    if (!imageUrl) return null;
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    try {
        const res = await fetch(imageUrl, {
            headers: { 'User-Agent': UA, 'Referer': articleUrl || imageUrl },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(buffer));
        return destPath;
    } catch (e) {
        return null;
    }
}

/**
 * Puppeteerを使用して画像を読み込み、軽量なJPG（600px幅）としてキャプチャし直す
 */
async function resizeImageWithPuppeteer(browser, inputPath, outputPath) {
    let page = null;
    try {
        page = await browser.newPage();
        const html = `<html><body style="margin:0;padding:0;"><img src="file://${inputPath}" style="width:400px;display:block;"></body></html>`;
        await page.setContent(html);
        const imgElement = await page.$('img');
        if (!imgElement) return false;
        
        await page.setViewport({ width: 400, height: 1200 }); // 十分な高さ
        const rect = await imgElement.boundingBox();
        if (!rect) return false;

        await page.screenshot({
            path: outputPath,
            clip: { x: 0, y: 0, width: 400, height: Math.min(rect.height, 800) }, // 極端に長い画像は制限
            type: 'jpeg',
            quality: 50
        });
        return true;
    } catch (e) {
        console.log(`[Image Resize] Error: ${e.message}`);
        return false;
    } finally {
        if (page) await page.close();
    }
}

async function main() {
    const dataDir = path.join(__dirname, '..', 'data');
    const insightsFile = path.join(dataDir, 'insights.json');
    const indexTemplateFile = path.join(__dirname, 'templates', 'index.ejs');
    const distDir = path.join(__dirname, '..', 'dist');
    const imageOutDir = path.join(distDir, 'images');
    const tempDir = path.join(__dirname, '..', 'tmp_img');

    if (!fs.existsSync(insightsFile)) {
        console.error('Error: insights.json not found.');
        process.exit(1);
    }

    const insightsData = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));
    
    // dist/images をクリーンアップ（古い画像が添付されるのを防ぐ）
    if (fs.existsSync(imageOutDir)) {
        console.log('Cleaning old images in dist/images...');
        fs.readdirSync(imageOutDir).forEach(file => {
            if (file.endsWith('.jpg') || file.endsWith('.png')) {
                fs.unlinkSync(path.join(imageOutDir, file));
            }
        });
    } else {
        fs.mkdirSync(imageOutDir, { recursive: true });
    }
    
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--allow-file-access-from-files',
            '--disable-dev-shm-usage', // GitHub Actions メモリ不足対策
            '--disable-gpu'
        ]
    });

    console.log('Optimizing images and generating gallery...');
    const galleryItems = [];

    for (const [category, insight] of Object.entries(insightsData)) {
        if (!insight) continue;

        const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let imageFileName = null;

        if (insight.originalImageUrl) {
            const rawPath = path.join(tempDir, `${safeName}_raw`);
            const optimizedName = `${safeName}_image.jpg`;
            const optimizedPath = path.join(imageOutDir, optimizedName);

            const downloaded = await downloadImageToFile(
                insight.originalImageUrl,
                insight.originalImageArticleUrl || insight.sourceUrl,
                rawPath
            );

            if (downloaded) {
                const resized = await resizeImageWithPuppeteer(browser, path.resolve(rawPath), optimizedPath);
                if (resized) {
                    imageFileName = optimizedName;
                    const stats = fs.statSync(optimizedPath);
                    console.log(`[Optimized] ${category}: ${Math.round(stats.size/1024)}KB`);
                }
            }
        }

        galleryItems.push({
            category,
            title: insight.title,
            summary: insight.summary,
            insight: insight.insight,
            sourceName: insight.sourceName,
            sourceUrl: insight.sourceUrl,
            imageFile: imageFileName
        });
    }

    // await browser.close(); // 後回しにする

    console.log('Reading index template...');
    const indexTemplateString = fs.readFileSync(indexTemplateFile, 'utf-8');
    try {
        console.log('Rendering EJS...');
        const indexContent = ejs.render(indexTemplateString, { slides: galleryItems });
        console.log('EJS Render Success');
        const outputPath = path.join(distDir, 'index.html');
        console.log(`Writing index.html to ${outputPath}...`);
        fs.writeFileSync(outputPath, indexContent, 'utf-8');
        console.log('index.html Written Success');
    } catch (renderError) {
        console.error('EJS/Write Error:', renderError);
        throw renderError;
    }

    console.log('Skipping cleanup to avoid hangs...');

    try {
        console.log('Closing browser...');
        await browser.close();
    } catch (_) {}

    console.log('Process completed successfully.');
    process.exit(0);
}

main().catch(error => {
    console.error('CRITICAL ERROR:', error.message || error);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});

// 予期せぬエラーのトラップ
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
