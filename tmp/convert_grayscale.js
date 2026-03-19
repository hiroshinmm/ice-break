const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function main() {
    const inputPath = path.resolve(__dirname, '..', 'src', 'assets', 'default_news.png');
    const outputPath = path.resolve(__dirname, '..', 'src', 'assets', 'default_news_grayscale.png');

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });

    const page = await browser.newPage();
    
    // 画像を読み込み、CSSでグレースケールを適用
    await page.goto(`file://${inputPath}`, { waitUntil: 'load' });
    
    // CSSを追加
    await page.addStyleTag({ content: 'body { margin: 0; padding: 0; } img { filter: grayscale(100%); display: block; }' });
    
    // 確実に読み込まれるまで少し待つ
    await new Promise(resolve => setTimeout(resolve, 1000));

    const imgElement = await page.$('img');
    const rect = await imgElement.boundingBox();
    
    await page.setViewport({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });

    await page.screenshot({
        path: outputPath,
        clip: { x: 0, y: 0, width: Math.ceil(rect.width), height: Math.ceil(rect.height) },
        omitBackground: true
    });

    await browser.close();
    console.log(`Saved grayscale image to: ${outputPath}`);
}

main().catch(console.error);
