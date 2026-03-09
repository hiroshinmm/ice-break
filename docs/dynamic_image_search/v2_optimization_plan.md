# 実装計画: 動的画像取得の修正（代替サービスへの移行とキーワード最適化）

## 概要
Unsplash Source の廃止および検索キーワードの長文化による画像表示不良を修正します。キーワードを極限までシンプルにし、安定性の高い画像提供サービスへ切り替えます。

## 修正内容

### 1. `src/generateInsights.js` の修正
- **プロンプトの追加**: JSON 出力に `imageKeywords` フィールドを追加し、Gemini に「検索用の極めて短いキーワード（2〜3語の英語）」を出力させます。
  - 例: "futuristic robot", "holographic display"

### 2. `src/captureSlides.js` の修正
- **取得サービスの変更**: 廃止された Unsplash Source から、安定して動作する **LoremFlickr** または **Pixabay**（もしAPI不要の公開URLがあれば）等へ変更を検討しますが、まずは最も互換性の高い `loremflickr.com` を試します。
- **URL構築の簡素化**:
  ```javascript
  const keywords = insight.imageKeywords || insight.category;
  const imageUrl = `https://loremflickr.com/1920/1080/${encodeURIComponent(keywords.replace(/\s+/g, ','))}/all`;
  ```

### 3. `src/templates/slide.ejs` の修正（必要に応じて）
- 画像の読み込みが遅い場合やエラー時のフォールバックとして、背景色を工夫します。

## 検証プラン
### 自動テスト
- `generateInsights.js` を実行し、`insights.json` に `imageKeywords` が正しく含まれるか確認。
- `captureSlides.js` を実行し、生成された PNG/JPG に画像が含まれているか確認。

### 手動確認
- GitHub Actions を実行し、各スライドに異なる画像が正しく表示されることを確認。
