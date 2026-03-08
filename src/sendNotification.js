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

  let insightsData = {};
  if (fs.existsSync(insightsFile)) {
    insightsData = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));
  }

  // Build Email Content
  const today = new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  let htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #1A2980; border-bottom: 2px solid #26D0CE; padding-bottom: 10px;">
        🚀 Weekly Tech Briefing - ${today}
      </h2>
      <p>おはようございます。今週のアイスブレイク用 最新技術トレンドスライドが生成されました。</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${GITHUB_PAGES_URL || '#'}" style="background-color: #4A90E2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          今週のスライドを開く (ギャラリー)
        </a>
      </div>
      
      <h3>📌 ピックアップトピック概要</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
  `;

  for (const [category, insight] of Object.entries(insightsData)) {
    if (!insight) continue;

    htmlContent += `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #eee; width: 30%; vertical-align: top;">
          <strong style="color: #4A90E2;">${category}</strong>
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #eee;">
          <strong>${insight.title}</strong><br>
          <span style="font-size: 13px; color: #666;">${insight.summary}</span><br>
          <a href="${insight.sourceUrl}" style="font-size: 12px; color: #999; text-decoration: none;">[Source: ${insight.sourceName}]</a>
        </td>
      </tr>
    `;
  }

  htmlContent += `
      </table>
      
      <div style="margin-top: 40px; font-size: 12px; color: #999; text-align: center;">
        <p>このメールは Automated Weekly Icebreaks システムによって自動送信されています。</p>
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
    subject: `【自動生成】Weekly Tech Briefing スライド更新通知 (${today})`,
    html: htmlContent
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
