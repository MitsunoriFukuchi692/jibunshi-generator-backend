import { Router } from 'express';
import Database from 'better-sqlite3';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);
const router = Router();
// ============================================
// POST /api/pdf/generate - PDF生成リクエスト
// ============================================
router.post('/generate', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        // ユーザー情報を取得
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // HTMLテンプレートを生成
        const htmlContent = generateHtmlTemplate(user);
        // Puppeteerでいったんレンダリング
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfPath = path.join(__dirname, `../../pdfs/user_${userId}_v1.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
        });
        await browser.close();
        // PDF情報をDBに保存
        const stmt = db.prepare(`INSERT INTO pdf_versions (user_id, version, html_content, pdf_path, status)
       VALUES (?, 1, ?, ?, 'draft')`);
        const result = stmt.run(userId, htmlContent, `/pdfs/user_${userId}_v1.pdf`);
        res.status(201).json({
            id: result.lastInsertRowid,
            userId,
            version: 1,
            pdf_path: `/pdfs/user_${userId}_v1.pdf`,
            status: 'draft',
            generated_at: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('❌ PDF generation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// GET /api/pdf/versions/:userId - PDF版履歴取得
// ============================================
router.get('/versions/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const stmt = db.prepare('SELECT id, version, status, generated_at FROM pdf_versions WHERE user_id = ? ORDER BY version DESC');
        const versions = stmt.all(userId);
        res.json(versions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// PUT /api/pdf/:versionId - PDF編集＆再生成
// ============================================
router.put('/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const { htmlContent } = req.body;
        if (!htmlContent) {
            return res.status(400).json({ error: 'htmlContent is required' });
        }
        // 既存バージョンを取得
        const pdfVersion = db.prepare('SELECT * FROM pdf_versions WHERE id = ?').get(versionId);
        if (!pdfVersion) {
            return res.status(404).json({ error: 'PDF version not found' });
        }
        const { user_id, version } = pdfVersion;
        const newVersion = version + 1;
        // Puppeteerで新しいPDFを生成
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfPath = path.join(__dirname, `../../pdfs/user_${user_id}_v${newVersion}.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
        });
        await browser.close();
        // 新バージョンをDBに保存
        const stmt = db.prepare(`INSERT INTO pdf_versions (user_id, version, html_content, pdf_path, status)
       VALUES (?, ?, ?, ?, 'draft')`);
        const result = stmt.run(user_id, newVersion, htmlContent, `/pdfs/user_${user_id}_v${newVersion}.pdf`);
        res.json({
            id: result.lastInsertRowid,
            user_id,
            version: newVersion,
            pdf_path: `/pdfs/user_${user_id}_v${newVersion}.pdf`,
            status: 'draft',
            generated_at: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('❌ PDF update error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Helper: HTMLテンプレート生成
// ============================================
function generateHtmlTemplate(user) {
    const currentYear = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${user.name}の自分史</title>
  <style>
    @page { size: A4; margin: 2cm; }
    * { margin: 0; padding: 0; }
    body {
      font-family: 'HGS正楷ポップ体', '游ゴシック', sans-serif;
      line-height: 1.6;
      color: #333;
    }
    .cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100vh;
      text-align: center;
      background: linear-gradient(135deg, #f5f5f5, #ffffff);
    }
    .cover h1 {
      font-size: 48px;
      margin-bottom: 20px;
      color: #333;
    }
    .cover p {
      font-size: 18px;
      color: #666;
    }
    .chapter {
      page-break-before: always;
      margin-bottom: 40px;
    }
    .chapter h2 {
      font-size: 32px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #333;
      color: #333;
    }
    .chapter p {
      font-size: 14px;
      margin-bottom: 15px;
      text-align: justify;
    }
    .photo {
      max-width: 100%;
      height: auto;
      margin: 20px 0;
      border: 1px solid #ddd;
    }
    .timeline {
      page-break-before: always;
    }
    .timeline h2 {
      font-size: 32px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    table td {
      padding: 10px;
      border: 1px solid #ddd;
    }
    table td:first-child {
      width: 15%;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <!-- 表紙 -->
  <div class="cover">
    <h1>${user.name}の自分史</h1>
    <p>作成年：${currentYear}年</p>
  </div>

  <!-- 生い立ち（プレースホルダー） -->
  <div class="chapter">
    <h2>第1章 生い立ち</h2>
    <p>この章では、${user.name}さんの生い立ちについて記録します。</p>
    <p>・誕生年：推定${currentYear - (user.age || 75)}年</p>
    <p>・初期の思い出や家族環境について、後ほど記述される予定です。</p>
  </div>

  <!-- 年表 -->
  <div class="timeline">
    <h2>人生年表</h2>
    <p>ここに時系列の重要な出来事を記録します。</p>
    <table>
      <tr>
        <td>年</td>
        <td>出来事</td>
      </tr>
      <tr>
        <td>-</td>
        <td>（データが入力されると自動表示）</td>
      </tr>
    </table>
  </div>

  <!-- フッター -->
  <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #999;">
    <p>このドキュメントは自動生成されました。編集・修正可能です。</p>
  </div>
</body>
</html>`;
}
export default router;
//# sourceMappingURL=pdf.js.map