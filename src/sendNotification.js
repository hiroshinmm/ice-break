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

  // Prepare attachments
  const attachments = [];
  if (fs.existsSync(imagesDir)) {
    const imageFiles = fs.readdirSync(imagesDir).filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
    for (const file of imageFiles) {
      attachments.push({
        filename: file,
        path: path.join(imagesDir, file),
        cid: path.parse(file).name // Use filename without extension as Content-ID
      });
    }
  }

  // Build Email Content
  const today = new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  let htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 10px;">
      <h2 style="color: #1A2980; border-bottom: 2px solid #26D0CE; padding-bottom: 10px; font-size: 20px;">
        🚀 Daily Tech Briefing - ${today}
      </h2>
      <p style="font-size: 14px; line-height: 1.6;">おはようございます。本日の最新技術トレンドスライドが生成されました。以下のサマリーと画像をご確認ください。</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${GITHUB_PAGES_URL || '#'}" style="background-color: #4A90E2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Webでスライドを開く
        </a>
      </div>
      
      <h3 style="margin-top: 30px; font-size: 18px;">📌 ピックアップトピック概要</h3>
      <div>
  `;

  for (const [category, insight] of Object.entries(insightsData)) {
    if (!insight) continue;

    const safeName = category.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const cid = safeName;
    const imgWebUrl = GITHUB_PAGES_URL ? `${GITHUB_PAGES_URL}images/${safeName}.png` : '#';

    htmlContent += `
      <div style="border: 1px solid #eee; border-radius: 8px; padding: 15px; background: #fafafa; margin-bottom: 30px; display: block; overflow: hidden;">
        <div style="margin-bottom: 8px;">
          <strong style="color: #4A90E2; font-size: 14px;">${category}</strong>
        </div>
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 16px;">
            <a href="${insight.sourceUrl}" target="_blank" style="color: #333; text-decoration: none;">${insight.title}</a>
          </strong>
        </div>
        <div style="font-size: 13px; color: #555; line-height: 1.6; margin-bottom: 10px;">
          ${insight.summary}
        </div>
        <div style="font-size: 13px; color: #333; line-height: 1.6; background-color: #eef7ff; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 3px solid #4A90E2;">
          <strong>💡 INSIGHT:</strong><br>
          ${insight.insight}
        </div>
        <div style="margin-bottom: 15px; text-align: center;">
          <a href="${imgWebUrl}" target="_blank" style="display: inline-block;">
            <img src="cid:${cid}" alt="${insight.title}" style="width: 100%; max-width: 600px; height: auto; border-radius: 4px; border: 1px solid #ddd; display: block; margin: 0 auto;" />
          </a>
        </div>
        <div>
          <a href="${insight.sourceUrl}" style="font-size: 12px; color: #999; text-decoration: none; display: inline-block;">[Source: ${insight.sourceName}]</a>
        </div>
      </div>
    `;
  }

  htmlContent += `
      </div>
      
      <div style="margin-top: 40px; font-size: 12px; color: #999; text-align: center;">
        <p>このメールは Automated Daily Icebreaks システムによって自動送信されています。</p>
      </div>
    </div>
  `;

  // Setup Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS // Use App Password if 2FA is enabled
    }
  });

  const mailOptions = {
    from: `"Tech Briefing Bot" <${GMAIL_USER}>`,
    to: GMAIL_TO,
    subject: `Daily Tech Briefing スライド更新通知 (${today})`,
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
