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
        const html = `<html><body style="margin:0;padding:0;"><img src="file://${inputPath}" style="width:600px;display:block;"></body></html>`;
        await page.setContent(html);
        const imgElement = await page.$('img');
        if (!imgElement) return false;
        
        await page.setViewport({ width: 600, height: 1200 }); // 十分な高さ
        const rect = await imgElement.boundingBox();
        if (!rect) return false;

        await page.screenshot({
            path: outputPath,
            clip: { x: 0, y: 0, width: 600, height: rect.height },
            type: 'jpeg',
            quality: 60
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
    if (!fs.existsSync(imageOutDir)) fs.mkdirSync(imageOutDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
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

    await browser.close();

    console.log('\nGenerating index.html gallery...');
    const indexTemplateString = fs.readFileSync(indexTemplateFile, 'utf-8');
    const indexContent = ejs.render(indexTemplateString, { slides: galleryItems });
    fs.writeFileSync(path.join(distDir, 'index.html'), indexContent, 'utf-8');

    // tmpDirのクリーンアップ（任意）
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch(_) {}

    console.log('Process completed.');
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
