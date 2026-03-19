# デイリー・テックブリーフィング 設計仕様書

## 1. システムアーキテクチャ
本システムは、ニュースの収集、AIによる分析、視覚化、および通知を自動化するサーバーレスアーキテクチャを採用しています。実行環境として **GitHub Actions** を利用し、静的コンテンツを **GitHub Pages** で公開します。

### 処理フロー
6.  **収集 (Fetch)**: RSSフィードおよびGoogle Newsからカテゴリ別のニュースを取得。
7.  **分析 (Insight)**: Gemini APIを用いて重要ニュースを抽出し、要約と技術インサイトを生成。
8.  **画像抽出 (Images)**: 記事のOGP画像を取得。Puppeteerで動的な解決も実施。
9.  **構成 (Assemble)**: EJSテンプレートを用いてWebギャラリー（index.html）を生成。画像はWebから取得したものを直接参照または軽量化して利用。
10. **公開 (Deploy)**: 生成物を `dist` フォルダに集約し、GitHub Pagesにデプロイ。
11. **通知 (Notify)**: 更新内容をメール（Nodemailer）で送信。

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

### 2.3 ギャラリー生成 (`src/captureSlides.js` -> 役割変更)
- **レンダリング**: EJSテンプレート (`src/templates/index.ejs`) を使用。
- **画像管理**: 
    - スライド画像（PNG/JPG）のレンダリングおよびキャプチャ機能を廃止。
    - 各記事のオリジナル画像URLを直接使用、または軽量化したキャッシュ画像を表示。
- **出力**: `dist/index.html` (Webギャラリー)

### 2.4 通知機能 (`src/sendNotification.js`)
- **方式**: Nodemailer による Gmail SMTP 送信。
- **内容**: カテゴリごとの技術インサイト本文と、HTMLメール内でのオリジナル画像表示（スライド画像の添付は廃止）。

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
