# Google News のレート制限 (Sorry ページ) 対応

Google News の RSS から取得した記事 URL をすべてオンラインで解決（リダイレクト追跡）しようとするため、Google から定期的にレート制限（CAPTCHA/Sorry ページへの誘導）を受け、ログが大量に出力される問題を修正します。

## 提案される変更点

### Core Utilities (urlUtils)

#### [MODIFY] [urlUtils.js](file:///c:/Users/hiros/OneDrive/デスクトップ/Antigravity/Ice%20Break/src/urlUtils.js)
- `resolveUrlOnline` のログレベルの調整、または呼び出し回数の削減に対する安全策を確認します。
- オンライン解決の失敗時に過剰な警告を表示しないようにします。

### News Fetching

#### [MODIFY] [fetchNews.js](file:///c:/Users/hiros/OneDrive/デスクトップ/Antigravity/Ice%20Break/src/fetchNews.js)
- ニュース取得段階（`fetchCategoryNews`）での `resolveUrlOnline` の呼び出しを削除します。
- **効率化 (New)**: カテゴリーごとのニュース取得 (`main` 内のループ) および各カテゴリー内の複数フィード読み込み (`fetchCategoryNews`) を `Promise.all` を用いて並列化します。これにより、全件取得までの待機時間を大幅に短縮します。

### Insight Generation

#### [MODIFY] [generateInsights.js](file:///c:/Users/hiros/OneDrive/デスクトップ/Antigravity/Ice%20Break/src/generateInsights.js)
- すでに選ばれた1件（各カテゴリー1件）についてのみ URL 解決を試みるロジックになっていることを再確認し、必要に応じて強化します。

## 検証計画

### 自動テスト（コマンド実行）
1. `npm run fetch` を実行。
   - ログに `Redirected to Google Sorry/Consent page` が表示されないことを確認。
   - `data/news.json` に Google News のリンクが保持されていることを確認。
2. `npm run insight` を実行。
   - 選ばれた記事の解決ログのみが表示され、正しくリンクが解決されることを確認。

### 手動検証
- 生成された `insights.json` の `sourceUrl` が（可能な限り）解決されたオリジナルの URL になっていることを確認。
