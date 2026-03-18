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
 * CBMi (新フォーマット): /rss/articles/ → /articles/ にアクセスしてリダイレクト追跡
 * CBM  (旧フォーマット): fetch後のHTMLから data-n-au 等を抽出
 * ※ タイムアウト 10 秒でハング防止
 */
async function resolveUrlOnline(googleUrl) {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    try {
        // CBMi 新フォーマット: /articles/ エンドポイントへのリダイレクト追跡
        // fetch の redirect: 'follow' で最終URLを取得する
        if (googleUrl.includes('/rss/articles/')) {
            const articlesUrl = googleUrl
                .replace('/rss/articles/', '/articles/')
                .replace(/\?.*$/, '');
            try {
                const res = await fetch(articlesUrl, {
                    method: 'GET',
                    headers: { 'User-Agent': userAgent },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(10000)
                });
                if (res.url && !res.url.includes('google.com')) {
                    return res.url;
                }
            } catch (_) { /* fallthrough to legacy method */ }
        }

        // 旧フォーマット (CBM) および /articles/ では解決できなかった場合の従来方式
        const response = await fetch(googleUrl, {
            method: 'GET',
            headers: { 'User-Agent': userAgent },
            signal: AbortSignal.timeout(10000)
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

module.exports = { decodeGoogleNewsUrl, resolveUrlOnline };
