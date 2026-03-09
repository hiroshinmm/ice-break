# 実装計画: 動的画像取得の実装

## 概要
現在のカテゴリー固定の画像表示から、ニュース記事の内容に応じた動的な画像取得へ移行します。Gemini が `insights.json` に書き出す `imagePrompt` をキーワードとして活用し、Unsplash から適切な画像を毎回取得します。

## 修正内容

### 1. `src/captureSlides.js` の修正
- **固定マッピングの削除**: `imageMap` 定数と、それに基づく画像選択ロジックを削除します。
- **動的キーワードの生成**: `insight.imagePrompt` から主要なキーワードを抽出し、検索クエリを作成します。
- **Unsplash 検索 URL の構築**:
  ```javascript
  const keywords = insight.imagePrompt.split(',').slice(0, 3).join(','); // 最初の3つのキーワードを抽出
  const imageUrl = `https://source.unsplash.com/featured/1920x1080/?${encodeURIComponent(keywords)}`;
  ```
- **フォールバック処理**: 検索が失敗した場合やプロンプトがない場合に備え、カテゴリー名や "technology" などをデフォルトキーワードとして使用します。

## 検証プラン
### 自動テスト
- `captureSlides.js` を実行し、`dist/images/` 内に記事内容に沿った異なる画像が生成されることを確認します。

### 手動確認
- GitHub Actions を実行し、Web ギャラリーに表示される画像がカテゴリー内で統一されず、記事ごとにバリエーションが出ていることを確認します。
