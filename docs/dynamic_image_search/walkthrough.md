# 修正内容の確認 (Walkthrough)

## 実施した修正
- **固定画像IDの廃止**: `captureSlides.js` から固定の `imageMap` を削除しました。
- **動的検索ロジックの導入**: 
  - Gemini が生成した `imagePrompt` から主要なキーワード（最初の3つのセグメント）を抽出。
  - テクニカルな用語（"8k", "no text" など）を除去し、画像検索に最適なクエリを生成。
  - Unsplash Source（`source.unsplash.com`）を活用し、1920x1080 形式でキーワードに合致する画像を動的に取得。
- **フォールバック**: プロンプトがない場合はカテゴリー名をキーワードとして使用。

## 検証結果
- カテゴリーごとに異なる、記事の内容を反映した画像が取得されることを確認しました。
- 同一カテゴリーでも、記事が変わるたびに画像が更新されるようになります。

## 実行ログ（デバッグ出力）の例
```text
[DEBUG] Category: "AI" -> Search Keywords: "A hyper-realistic, AI neural network" -> URL: https://source.unsplash.com/featured/1920x1080/?A%20hyper-realistic%2C%20AI%20neural%20network
```
