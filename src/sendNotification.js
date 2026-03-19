const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const { GMAIL_USER, GMAIL_PASS, GMAIL_TO, GITHUB_PAGES_URL } = process.env;

  if (!GMAIL_USER || !GMAIL_PASS || !GMAIL_TO) {
    console.error('Error: Gmail credentials (GMAIL_USER, GMAIL_PASS, GMAIL_TO) are not fully set in .env');
    process.exit(1);
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const insightsFile = path.join(dataDir, 'insights.json');
  const imagesDir = path.join(__dirname, '..', 'dist', 'images');

  let insightsData = {};
  if (fs.existsSync(insightsFile)) {
    insightsData = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));
  }

  // 添付ファイルの準備 (記事のオリジナル画像をインライン表示用に添付)
  const attachments = [];
  
  // デフォルトアイコンの準備
  const assetsDir = path.join(__dirname, 'assets');
  const defaultIconPath = path.join(assetsDir, 'default_news.png');
  if (fs.existsSync(defaultIconPath)) {
    attachments.push({
      filename: 'default_news.png',
      path: defaultIconPath,
      cid: 'default_icon'
    });
  }

  if (fs.existsSync(imagesDir)) {
    const imageFiles = fs.readdirSync(imagesDir).filter(file => /_image\.jpg$/i.test(file));
    for (const file of imageFiles) {
      attachments.push({
        filename: file,
        path: path.join(imagesDir, file),
        cid: path.parse(file).name // safeName_image
      });
    }
  }

  // メール本文の構築
  const today = new Date().toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'short',
    day: 'numeric'
  });
  let htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 10px;">
      <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; font-size: 20px;">
        🚀 Daily Tech Briefing - ${today}
      </h2>
      <p style="font-size: 14px; line-height: 1.6;">おはようございます。本日の最新技術ニュースをお届けします。以下の要約とインサイトをご確認ください。</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${GITHUB_PAGES_URL || '#'}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
          Webギャラリーで詳しく見る
        </a>
      </div>
      
      <h3 style="margin-top: 30px; font-size: 18px; color: #1e293b;">📌 本日のピックアップ</h3>
      <div>
  `;

  for (const [category, insight] of Object.entries(insightsData)) {
    if (!insight) continue;

    const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const cid = `${safeName}_image`;
    
    // この記事の画像が添付ファイルにあるか確認
    const hasImage = attachments.some(a => a.cid === cid);
    const displayCid = hasImage ? cid : 'default_icon';
    const imgStyle = hasImage 
      ? "width: 100%; max-width: 600px; height: auto; border-radius: 8px; border: 1px solid #f1f5f9; display: block; margin: 0 auto;"
      : "width: 100%; max-width: 150px; height: auto; border-radius: 8px; border: 1px solid #f1f5f9; display: block; margin: 0 auto; filter: grayscale(100%); opacity: 0.5;";

    htmlContent += `
      <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: #ffffff; margin-bottom: 30px; display: block; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="margin-bottom: 10px;">
          <strong style="color: #3b82f6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">${category}</strong>
        </div>
        <div style="margin-bottom: 15px;">
          <strong style="font-size: 18px;">
            <a href="${insight.sourceUrl}" target="_blank" style="color: #1e293b; text-decoration: none;">${insight.title}</a>
          </strong>
        </div>
        
        <div style="margin-bottom: 20px; text-align: center;">
          <a href="${insight.sourceUrl}" target="_blank" style="display: inline-block; width: 100%;">
            <img src="cid:${displayCid}" alt="${insight.title}" style="${imgStyle}" />
          </a>
        </div>

        <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 15px;">
          ${insight.summary}
        </div>
        
        <div style="font-size: 13px; color: #475569; line-height: 1.6; background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #3b82f6; font-style: italic;">
          <strong>💡 Technical Insight:</strong><br>
          ${insight.insight}
        </div>

        <div style="text-align: right;">
          <a href="${insight.sourceUrl}" style="font-size: 12px; color: #64748b; text-decoration: none;">Source: ${insight.sourceName}</a>
        </div>
      </div>
    `;
  }

  htmlContent += `
      </div>
      
      <div style="margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center;">
        <p>このメールは Automated Daily Icebreaks システムによって自動送信されています。</p>
      </div>
    </div>
  `;

  // Setup Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS // 2FA有効時はアプリパスワードを使用
    }
  });

  const mailOptions = {
    from: `"Ice Break Bot" <${GMAIL_USER}>`,
    to: GMAIL_TO,
    subject: `Daily Tech Briefing 更新通知 (${today})`,
    html: htmlContent,
    attachments: attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully: ${info.messageId}`);
    process.exit(0);
  } catch (error) {
    console.error('Error sending email:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
