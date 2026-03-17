/**
 * URLユーティリティ: fetchNews.js と generateInsights.js が共有する
 * Google News URL の解決ロジック
 */

/**
 * Google NewsのリンクからオリジナルのURLをオフラインで抽出する
 * Protobuf エンコードされた CBM... 形式に対応
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
 * オンラインで Google News リダイレクトを追跡して元の URL を解決する
 * ※ タイムアウト 8 秒でハング防止
 */
async function resolveUrlOnline(googleUrl) {
    try {
        const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const response = await fetch(googleUrl, {
            method: 'GET',
            headers: { 'User-Agent': userAgent },
            signal: AbortSignal.timeout(8000) // タイムアウト追加
        });
        const text = await response.text();

        // New Google News format
        const nauMatch = text.match(/data-n-au="([^"]+)"/);
        if (nauMatch) return nauMatch[1];

        const pMatch = text.match(/data-p="([^"]+)"/);
        if (pMatch && pMatch[1].startsWith('http')) return pMatch[1];

        // Meta refresh
        const refreshMatch = text.match(/url=(http[^"]+)"/i);
        if (refreshMatch) return refreshMatch[1];

        if (response.url && !response.url.includes('google.com')) return response.url;
        return googleUrl;
    } catch (e) {
        return googleUrl;
    }
}

module.exports = { decodeGoogleNewsUrl, resolveUrlOnline };
