# デイリー・テックブリーフィング 設計仕様書

## 1. システムアーキテクチャ
本システムは、ニュースの収集、AIによる分析、視覚化、および通知を自動化するサーバーレスアーキテクチャを採用しています。実行環境として **GitHub Actions** を利用し、静的コンテンツを **GitHub Pages** で公開します。

### 処理フロー
1.  **収集 (Fetch)**: RSSフィードおよびGoogle Newsからカテゴリ別のニュースを取得。
2.  **分析 (Insight)**: Gemini APIを用いて重要ニュースを抽出し、要約と技術インサイトを生成。
3.  **画像抽出 (Images)**: 記事のOGP画像を取得。Puppeteerで動的な解決も実施。
4.  **描画 (Capture)**: EJSテンプレートをスライド画像（PNG/JPG）としてレンダリング。
5.  **公開 (Deploy)**: 生成物を `dist` フォルダに集約し、GitHub Pagesにデプロイ。
6.  **通知 (Notify)**: 更新内容をメール（Nodemailer）で送信。

---

## 2. コンポーネント詳細

### 2.1 ニュース収集 (`src/fetchNews.js`)
- **方式**: `rss-parser` を用いて複数のフィードを並列取得。
- **期間**: 直近7日間 (`config.DAYS_TO_FETCH`) の記事を対象。
- **フィルタリング**: タイトルとリンクによる重複排除を行い、上位20件を保持。
- **出力**: `data/news.json`

### 2.2 AI分析・画像抽出 (`src/generateInsights.js`)
- **LLM**: Google Gemini API (`gemini-3.1-flash-lite-preview`)
    - 役割: 各カテゴリから1件を厳選、150文字要約、技術的インサイトの生成。
- **リンク解決**: Google Newsの短縮・リダイレクトURLを `urlUtils.js` または Puppeteer でデコードし、オリジナルの記事URLを特定。
- **画像抽出**: 
    - `fetch` による OGP (og:image) および Twitter Card 取得。
    - 取得失敗時は Puppeteer でページをレンダリングし、ヒューリスティックな画像抽出を実施。
- **出力**: `data/insights.json`

### 2.3 スライド生成 (`src/captureSlides.js`)
- **レンダリング**: EJSテンプレート (`src/templates/slide.ejs`) を使用。
- **キャプチャ**: Puppeteer を使用。
    - **PNG**: 1920x1080 (deviceScaleFactor: 2) - 高解像度 Web/アーカイブ用。
    - **JPG**: 1920x1080 (quality: 60) - 軽量メール添付用。
- **ギャラリー生成**: `src/templates/index.ejs` から `dist/index.html` を生成。

### 2.4 通知機能 (`src/sendNotification.js`)
- **方式**: Nodemailer による Gmail SMTP 送信。
- **内容**: カテゴリごとの技術インサイト本文と、軽量化されたJPGスライド画像の添付。

---

## 3. データ設計

### ニュースデータ (`news.json`)
```json
{
  "AI": [
    {
      "title": "...",
      "link": "...",
      "pubDate": "...",
      "source": "...",
      "imageUrl": "...",
      "snippet": "..."
    }
  ]
}
```

### インサイトデータ (`insights.json`)
```json
{
  "AI": {
    "title": "スライド見出し",
    "summary": "150文字要約",
    "insight": "技術的考察",
    "sourceUrl": "元記事リンク",
    "sourceName": "メディア名",
    "originalImageUrl": "抽出画像URL"
  }
}
```

---

## 4. UI/UX デザイン設計
- **タイポグラフィ**: Google Fonts 'Outfit'（モダン・プレミアムな印象）。
- **グリッドシステム**:
    - デスクトップ: 2カラム（最大幅 1800px）。
    - モバイル: 1カラム（ブレークポイント 1100px）。
- **配色**: グラデーション背景とホワイトベースのカードデザインによる「モダンな技術誌」風の演出。

---

## 5. インフラ・自動化 (CI/CD)
- **GitHub Actions**:
    - スケジュール: 毎日 23:00 UTC (日本時間 8:00 AM)。
    - 環境変数: `GEMINI_API_KEY`, `GMAIL_USER`, `GMAIL_PASS` 等。
- **セキュリティ**: APIキーやパスワードは GitHub Secrets で管理。

---
*最終更新日: 2026年3月17日*
