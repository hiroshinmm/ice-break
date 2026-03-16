const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

/**
 * Google NewsのリンクからオリジナルのURLを抽出する
 */
function decodeGoogleNewsUrl(encodedUrl) {
    if (!encodedUrl.includes('news.google.com')) return encodedUrl;
    try {
        const urlObj = new URL(encodedUrl);
        const pathParts = urlObj.pathname.split('/');
        const base64Str = pathParts.find(p => p.startsWith('CBM')) || pathParts[pathParts.length - 1];
        const actualBase64 = base64Str.startsWith('CBM') ? base64Str.substring(3) : base64Str;
        const buffer = Buffer.from(actualBase64, 'base64');
        const raw = buffer.toString('latin1');
        const start = raw.indexOf('http');
        if (start === -1) return encodedUrl;
        let url = '';
        for (let i = start; i < raw.length; i++) {
            const code = raw.charCodeAt(i);
            if (code < 32 || code > 126 || [34, 39, 60, 62].includes(code)) break;
            url += raw[i];
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
        const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const response = await fetch(googleUrl, {
            method: 'GET',
            headers: { 'User-Agent': userAgent }
        });
        const text = await response.text();
        const nauMatch = text.match(/data-n-au="([^"]+)"/);
        if (nauMatch) return nauMatch[1];
        const pMatch = text.match(/data-p="([^"]+)"/);
        if (pMatch && pMatch[1].startsWith('http')) return pMatch[1];
        const refreshMatch = text.match(/url=(http[^"]+)"/i);
        if (refreshMatch) return refreshMatch[1];
        if (response.url && !response.url.includes('google.com')) return response.url;
        return googleUrl;
    } catch (e) {
        return googleUrl;
    }
}

/**
 * Puppeteerを使用してリダイレクトを完全に追跡し、ページ内の主要な画像も探す
 */
async function resolveUrlWithPuppeteer(googleUrl, browser) {
    let page = null;
    try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(googleUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        try {
            await page.waitForFunction(() => !window.location.href.includes('google.com'), { timeout: 10000 });
        } catch (e) {}

        const finalUrl = page.url();
        
        // メタデータ、または本文内の「もっともらしい」画像を抽出する
        const detectedImageUrl = await page.evaluate(() => {
            // 1. OGP
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.content) return og.content;
            
            // 2. Twitter
            const tw = document.querySelector('meta[name="twitter:image"]');
            if (tw && tw.content) return tw.content;
            
            // 3. LD+JSON (Structured Data) - Good for AMP
            const ldTags = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const ld of ldTags) {
                try {
                    const data = JSON.parse(ld.innerText);
                    const findImage = (obj) => {
                        if (!obj) return null;
                        if (obj.image) {
                            if (typeof obj.image === 'string') return obj.image;
                            if (Array.isArray(obj.image) && obj.image[0]) return typeof obj.image[0] === 'string' ? obj.image[0] : (obj.image[0].url || null);
                            if (obj.image.url) return obj.image.url;
                        }
                        if (obj.thumbnailUrl) return obj.thumbnailUrl;
                        // For nested Graph objects
                        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                            for (const g of obj['@graph']) {
                                const found = findImage(g);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    const found = findImage(data);
                    if (found && !found.startsWith('data:')) return found;
                } catch(e) {}
            }
            
            // 4. AMP Image fallback
            const ampImg = document.querySelector('amp-img');
            if (ampImg && ampImg.src && !ampImg.src.startsWith('data:')) return ampImg.src;

            // 5. Heuristic: 記事本文内の大きな画像
            const contentArea = document.querySelector('article, .content, .post, .entry-content, .field--name-body, main');
                if (contentArea) {
                    const imgs = Array.from(contentArea.querySelectorAll('img'))
                        .filter(img => {
                            const src = img.src || '';
                            const isVisible = img.offsetWidth > 10 && img.offsetHeight > 10;
                            const ratio = img.offsetWidth / img.offsetHeight;
                            const hasGoodRatio = ratio > 0.5 && ratio < 3.0;
                            
                            return src.startsWith('http') && 
                                   !src.startsWith('data:') && // Exclude base64
                                   isVisible &&
                                   hasGoodRatio &&
                                   !src.toLowerCase().includes('ads') && 
                                   !src.toLowerCase().includes('banner') &&
                                   !src.toLowerCase().includes('matomo') &&
                                   !src.toLowerCase().includes('pixel') &&
                                   !src.toLowerCase().includes('icon') &&
                                   !src.toLowerCase().includes('logo') &&
                                   !src.toLowerCase().includes('avatar') &&
                                   !src.toLowerCase().includes('gravatar') &&
                                   !src.toLowerCase().includes('profile');
                        })
                        .sort((a, b) => {
                            const scoreA = (a.src.toLowerCase().endsWith('.gif') ? 0 : 1) * (a.offsetWidth * a.offsetHeight);
                            const scoreB = (b.src.toLowerCase().endsWith('.gif') ? 0 : 1) * (b.offsetWidth * b.offsetHeight);
                            return scoreB - scoreA;
                        });
                    
                    if (imgs.length > 0) return imgs[0].src;
                }
            
            // 4. Fallback: ページ全体の画像から一定サイズ以上のものを抽出
            const allImgs = Array.from(document.querySelectorAll('img'))
                .filter(img => img.offsetWidth > 100) // Lowered from 300 to 100 to catch smaller images like LEDInside
                .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
                
            return allImgs.length > 0 ? allImgs[0].src : null;
        });

        return { finalUrl, detectedImageUrl };
    } catch (e) {
        return { finalUrl: googleUrl, detectedImageUrl: null };
    } finally {
        if (page) await page.close();
    }
}

/**
 * 記事のHTMLからOG画像を抽出する
 */
async function fetchOgImage(url, browser) {
    if (!url || url.includes('google.com')) return null;
    try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Referer': url // Set Referer to article's own URL to bypass some blocks
            },
            signal: AbortSignal.timeout(10000) // 10s timeout
        });
        
        if (response.ok) {
            const text = await response.text();
            let imgUrl = null;
            
            // 1. OGP
            const ogImageMatch = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                                 text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (ogImageMatch) imgUrl = ogImageMatch[1];
            
            // 2. Twitter
            if (!imgUrl) {
                const twitterImageMatch = text.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                          text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
                if (twitterImageMatch) imgUrl = twitterImageMatch[1];
            }

            // 3. LD+JSON (Structured Data) - Good for AMP and Sony
            if (!imgUrl) {
                const ldJsonMatches = text.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
                if (ldJsonMatches) {
                    for (const scriptTag of ldJsonMatches) {
                        try {
                            const jsonContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, '').trim();
                            const data = JSON.parse(jsonContent);
                            const findImage = (obj) => {
                                if (!obj) return null;
                                if (obj.image) {
                                    if (typeof obj.image === 'string') return obj.image;
                                    if (Array.isArray(obj.image) && obj.image[0]) return typeof obj.image[0] === 'string' ? obj.image[0] : (obj.image[0].url || null);
                                    if (obj.image.url) return obj.image.url;
                                }
                                if (obj.thumbnailUrl) return obj.thumbnailUrl;
                                // Handle nested Graph
                                if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                                    for (const g of obj['@graph']) {
                                        const found = findImage(g);
                                        if (found) return found;
                                    }
                                }
                                return null;
                            };
                            const found = findImage(data);
                            if (found && !found.startsWith('data:')) {
                                imgUrl = found;
                                break;
                            }
                        } catch (e) {}
                    }
                }
            }

            // 4. HTML Fallback: find first relevant looking img tag in content (crude regex)
            if (!imgUrl) {
                const imgTagMatch = text.match(/<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i);
                if (imgTagMatch && !imgTagMatch[1].startsWith('data:') && !imgTagMatch[1].includes('icon') && !imgTagMatch[1].includes('logo') && !imgTagMatch[1].includes('avatar')) {
                    imgUrl = imgTagMatch[1];
                }
            }

            if (imgUrl && !imgUrl.startsWith('data:')) {
                // Ensure absolute URL
                if (imgUrl.startsWith('//')) {
                    imgUrl = 'https:' + imgUrl;
                } else if (imgUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    imgUrl = urlObj.origin + imgUrl;
                } else if (!imgUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    const basePath = urlObj.pathname.endsWith('/') ? urlObj.pathname : urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
                    imgUrl = urlObj.origin + basePath + imgUrl;
                }
                return imgUrl;
            }
        }
    } catch (e) {
        console.log(`Simple fetch failed for ${url}: ${e.message}`);
    }

    // Simple fetch failed or returned nothing, fallback to Puppeteer if provided
    if (browser) {
        console.log(`Falling back to Puppeteer for image extraction: ${url.substring(0, 50)}...`);
        const result = await resolveUrlWithPuppeteer(url, browser);
        return result.detectedImageUrl;
    }
    return null;
}

async function main() {
    if (!config.GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }

    const dataDir = path.join(__dirname, '..', 'data');
    const newsFile = path.join(dataDir, 'news.json');

    if (!fs.existsSync(newsFile)) {
        console.error('Error: news.json not found. Run fetchNews.js first.');
        process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

    console.log(`Using model: ${config.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const insights = {};

    // Puppeteerのブラウザを起動（選別された数件のために使用）
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (const [category, items] of Object.entries(newsData)) {
            console.log(`\nGenerating insight for category: ${category}`);

            if (!items || items.length === 0) {
                console.log(`No news found for ${category}. Skipping.`);
                insights[category] = null;
                continue;
            }

            const newsText = items.slice(0, 10).map((item, index) =>
                `[${index + 1}] Title: ${item.title}\nSource: ${item.source}\nLink: ${item.link}\nSnippet: ${item.snippet}\n`
            ).join('\n');

            const prompt = `
You are an expert AI assistant for Sony's display development software engineers.
Your task is to review the following recent news articles in the category "${category}" and pick ONE most interesting/important topic to present as an icebreak at a morning meeting.
If the news is not directly relevant to displays, cameras, XR, or technology, try to find the tech angle.

Output a valid JSON object with the following structure:
{
  "title": "A catchy, short title for the slide (Japanese, max 40 chars)",
  "summary": "A summary of the news (Japanese, around 150 characters, capturing the main points clearly)",
  "insight": "A deep insight 'INSIGHT' tailored for display software engineers. Why does this matter? What is the technical implication? (Japanese, 3-4 sentences)",
  "sourceUrl": "The exact URL of the picked article from the provided list",
  "sourceName": "The name of the source (e.g. 4Gamer, The Verge)"
}

Here are the recent news articles:
${newsText}
`;

            try {
                const result = await model.generateContent(prompt);
                const response = result.response;
                const jsonText = response.text();
                const parsed = JSON.parse(jsonText);

                // 最後に選ばれた1件のみ、リンクの解決と画像の再取得を行う
                let pickedItem = items.find(item => item.link === parsed.sourceUrl);
                if (!pickedItem) {
                    pickedItem = items[0];
                }

                // Google Newsリンクなら解決を試みる
                if (pickedItem.link.includes('news.google.com')) {
                    console.log(`Resolving picked article link: ${pickedItem.link.substring(0, 50)}...`);
                    let resolved = decodeGoogleNewsUrl(pickedItem.link);
                    if (resolved.includes('news.google.com')) {
                        resolved = await resolveUrlOnline(pickedItem.link);
                    }
                    if (resolved.includes('news.google.com')) {
                        const result = await resolveUrlWithPuppeteer(pickedItem.link, browser);
                        resolved = result.finalUrl;
                        if (result.detectedImageUrl) {
                            pickedItem.imageUrl = result.detectedImageUrl;
                        }
                    }
                    pickedItem.link = resolved;
                    parsed.sourceUrl = resolved;
                }

                // 選ばれた1件については、RSSのサムネイル等がある場合でも、より高品質な画像を求めて再取得を試みる
                if (!pickedItem.link.includes('google.com')) {
                    console.log(`Ensuring high quality OGP image for: ${pickedItem.link.substring(0, 50)}...`);
                    const ogImage = await fetchOgImage(pickedItem.link, browser);
                    if (ogImage) {
                        pickedItem.imageUrl = ogImage;
                    }
                }

                if (pickedItem.imageUrl) {
                    console.log(`Setting final image URL: ${pickedItem.imageUrl}`);
                    parsed.originalImageUrl = pickedItem.imageUrl;
                } else {
                    console.log(`No image found for ${category}. Will use default icon.`);
                }

                insights[category] = parsed;
                console.log(`Success: ${parsed.title}`);
            } catch (error) {
                console.error(`Error generating insight for ${category}:`, error.message);
                insights[category] = null;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } finally {
        await browser.close();
    }

    const outFile = path.join(dataDir, 'insights.json');
    fs.writeFileSync(outFile, JSON.stringify(insights, null, 2), 'utf-8');
    console.log(`\nSaved insights data to ${outFile}`);
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
