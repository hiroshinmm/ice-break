# 実装計画: Google News リンク解決と画像取得の強化

## 概要
ニュースソースが Google News (`news.google.com`) の場合に、リダイレクトリンクを解消して本来の記事 URL を取得し、さらにその記事ページからアイキャッチ画像（`og:image` 等）を抽出するように `fetchNews.js` を改修します。これにより、画像表示のヒット率を向上させます。

## 変更内容

### 1. `src/fetchNews.js` の改修
以下を新機能として追加します：
- **`decodeGoogleNewsUrl(url)`**: Google News のエンコードされた URL をオフラインでデコード（Base64）。
- **`resolveUrlOnline(url)`**: `fetch` を使用してリダイレクト先（Meta Refresh 等）を追跡し、最終的な URL を取得。
- **`fetchOgImage(url)`**: 解決したターゲット URL の HTML を取得し、`og:image` や `twitter:image` メタタグから画像 URL を抽出。

### 2. 処理フローの更新
`fetchCategoryNews` 関数内のループを以下のように修正します：
1. RSS アイテムのリンクが `news.google.com` の場合、デコードおよびオンライン解決を試みる。
2. RSS 自体に `media:content` 等の画像が含まれていない場合、解決したリンク先に対して `fetchOgImage` を実行する。
3. 取得した `imageUrl` と `link` を `news.json` に保存する。

## 検証プラン
- GitHub Actions を手動実行し、`Google News` 由来の記事で `imageUrl` が正しく補完されているかログを確認。
- `data/news.json` を開き、リンクがリダイレクト後のものになっていること、画像 URL が設定されていることを確認。
