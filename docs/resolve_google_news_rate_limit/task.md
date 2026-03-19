# Tasks

- [x] `src/fetchNews.js` の修正
  - [x] 全記事の `resolveUrlOnline` 呼び出しを削除し、元のURLをそのまま保持するように変更
- [x] `src/urlUtils.js` の修正
  - [x] `CBMi` 形式の判定と解決ロジックの整理（オンライン解決の最小限化）
  - [x] 不要なログ出力の抑制
- [x] `src/generateInsights.js` の確認
  - [x] 選ばれた1件のみ `resolveUrlOnline` または `resolveUrlWithPuppeteer` で解決していることを確認
- [x] 効率化の実施 (Efficiency Improvements)
  - [x] `fetchNews.js` の並列化 (`Promise.all` の導入)
  - [x] `generateInsights.js` の小規模な最適化 (並列取得の検討) [/]
- [x] 動作確認
  - [x] `node src/fetchNews.js` を実行し、実行時間が短縮されていることを確認
  - [x] `node src/generateInsights.js` を実行し、正常に動作することを確認
