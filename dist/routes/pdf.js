import express from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
// ============================================
// 認証ミドルウェア
// ============================================
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    if (!token) {
        return res.status(401).json({ error: '認証が必要です' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: '無効または期限切れのトークンです' });
    }
    req.user = decoded;
    next();
};
// ============================================
// POST /api/pdf/generate - PDFを生成（biography + metadata を合体）
// ============================================
router.post('/generate', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const userId = user.userId;
        console.log('📄 PDF generation request - userId:', userId);
        const db = getDb();
        // ✅ ユーザーデータ取得
        const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!userRecord) {
            console.error('❌ User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        // ✅ 自分史物語を取得
        const biography = db.prepare(`
      SELECT id, edited_content 
      FROM biography 
      WHERE user_id = ?
    `).get(userId);
        if (!biography) {
            console.warn('⚠️ No biography found');
            return res.status(400).json({ error: 'Biography not found' });
        }
        console.log('📖 Biography found - length:', biography.edited_content.length);
        // ✅ 自分史物語に紐づく写真を取得
        const photos = db.prepare(`
      SELECT file_path, description
      FROM biography_photos
      WHERE biography_id = ?
      ORDER BY display_order ASC
    `).all(biography.id);
        console.log('📸 Photos:', photos.length);
        // ✅ 人生年表（timeline_metadata）を取得
        const timelineMetadata = db.prepare(`
      SELECT important_events
      FROM timeline_metadata
      WHERE user_id = ?
    `).get(userId);
        let importantEvents = [];
        if (timelineMetadata && timelineMetadata.important_events) {
            try {
                importantEvents = JSON.parse(timelineMetadata.important_events);
                console.log('📊 Important events parsed:', importantEvents.length);
            }
            catch (e) {
                console.warn('⚠️ Failed to parse important_events JSON');
            }
        }
        // ============================================
        // PDF生成（biography + timelineMetadata を合体）
        // ============================================
        const pdfBuffer = await generatePDF(userRecord, biography, photos, importantEvents);
        // PDFを保存
        const pdfDir = path.join(__dirname, '../pdfs');
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }
        const filename = `autobiography_${userId}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        fs.writeFileSync(filepath, pdfBuffer);
        console.log('✅ PDF saved:', filename);
        // DBに記録
        db.prepare(`
      INSERT INTO pdf_versions (user_id, file_path, filename, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(userId, `/pdfs/${filename}`, filename, 1, 'generated');
        res.json({
            success: true,
            filename: filename,
            filepath: `/pdfs/${filename}`
        });
    }
    catch (error) {
        console.error('❌ PDF generation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// GET /api/pdf/download/:filename - PDFをダウンロード
// ============================================
router.get('/download/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        // セキュリティチェック: filename が安全か確認
        if (!filename || filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        const pdfPath = path.join(__dirname, '../pdfs', filename);
        if (!fs.existsSync(pdfPath)) {
            return res.status(404).json({ error: 'PDF file not found' });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.sendFile(pdfPath);
        console.log('✅ PDF downloaded:', filename);
    }
    catch (error) {
        console.error('❌ PDF download error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// PDF生成メイン処理
// ============================================
async function generatePDF(user, biography, photos, importantEvents) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            bufferPages: true,
        });
        // フォント設定
        const fontPath = path.join(__dirname, '../../fonts/NotoSansJP-Regular.ttf');
        console.log('🔍 Font path:', fontPath);
        console.log('📁 Font exists:', fs.existsSync(fontPath));
        if (fs.existsSync(fontPath)) {
            console.log('✅ Font file found - registering JapaneseFont');
            doc.registerFont('JapaneseFont', fontPath);
        }
        else {
            console.log('❌ Font file NOT found - using Helvetica');
            doc.registerFont('JapaneseFont', 'Helvetica');
        }
        const buffer = [];
        doc.on('data', (chunk) => {
            buffer.push(chunk);
        });
        doc.on('end', () => {
            resolve(Buffer.concat(buffer));
        });
        doc.on('error', (error) => {
            console.error('❌ PDF error:', error);
            reject(error);
        });
        try {
            // ============================================
            // ページ1: 表紙
            // ============================================
            doc.fontSize(28).font('JapaneseFont').text('📖 わたしの自分史', { align: 'center' });
            doc.moveDown(2);
            doc.fontSize(18).font('JapaneseFont').text(user.name || '（名前未設定）', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(14).font('JapaneseFont').fillColor('#666666').text(`年齢: ${user.age || '未設定'}歳`, { align: 'center' });
            doc.moveDown(3);
            doc.fontSize(12).font('JapaneseFont').fillColor('#999999').text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'center' });
            // ============================================
            // ページ2: 自分史物語（biography.edited_content）
            // ============================================
            doc.addPage();
            doc.fontSize(18).font('JapaneseFont').fillColor('#2c3e50').text('📚 わたしの人生物語', { underline: true });
            doc.moveDown(1);
            if (biography.edited_content && biography.edited_content.trim()) {
                console.log('📖 Displaying biography content');
                doc.fontSize(11).font('JapaneseFont').fillColor('#000000');
                doc.text(biography.edited_content, {
                    align: 'left',
                    width: 500
                });
            }
            // ============================================
            // 写真セクション
            // ============================================
            if (photos && photos.length > 0) {
                console.log('📸 Adding photos section');
                doc.addPage();
                doc.fontSize(16).font('JapaneseFont').fillColor('#2c3e50').text('📷 思い出の写真', { underline: true });
                doc.moveDown(1);
                const photosPerPage = 3;
                let pagePhotoCount = 0;
                photos.forEach((photo, photoIdx) => {
                    try {
                        if (pagePhotoCount >= photosPerPage) {
                            doc.addPage();
                            pagePhotoCount = 0;
                        }
                        let photoPath = null;
                        let isBase64 = false;
                        if (photo.file_path.startsWith('data:')) {
                            isBase64 = true;
                            photoPath = photo.file_path;
                        }
                        else if (fs.existsSync(photo.file_path)) {
                            photoPath = photo.file_path;
                        }
                        if (!photoPath) {
                            console.warn('⚠️ Photo skipped - invalid path');
                            return;
                        }
                        const x = 50;
                        const y = 80 + (pagePhotoCount * 200);
                        const photoWidth = 500;
                        const photoHeight = 150;
                        if (isBase64) {
                            const base64Data = photoPath.replace(/^data:image\/\w+;base64,/, '');
                            const photoBuffer = Buffer.from(base64Data, 'base64');
                            doc.image(photoBuffer, x, y, { width: photoWidth, height: photoHeight });
                        }
                        else {
                            doc.image(photoPath, x, y, { width: photoWidth, height: photoHeight });
                        }
                        pagePhotoCount++;
                    }
                    catch (photoError) {
                        console.warn('⚠️ Photo error:', photoError);
                    }
                });
            }
            // ============================================
            // 最後のページ: 人生年表（timeline_metadata.important_events）
            // ============================================
            doc.addPage();
            doc.fontSize(16).font('JapaneseFont').fillColor('#2c3e50').text('📊 人生年表', { underline: true });
            doc.moveDown(0.5);
            const tableTop = doc.y;
            const col1X = 60;
            const col2X = 130;
            const col3X = 200;
            const rowHeight = 20;
            // ヘッダー
            doc.fontSize(10).font('JapaneseFont').fillColor('#333333');
            doc.text('年', col1X, tableTop, { width: 60 });
            doc.text('月', col2X, tableTop, { width: 60 });
            doc.text('できごと', col3X, tableTop, { width: 300 });
            // 区切り線
            doc.strokeColor('#cccccc').moveTo(col1X, tableTop + 15).lineTo(550, tableTop + 15).stroke();
            let currentY = tableTop + 20;
            // important_events を表示
            if (importantEvents && importantEvents.length > 0) {
                console.log('📊 Displaying', importantEvents.length, 'events');
                importantEvents.forEach((event, idx) => {
                    const yearText = event.year ? event.year.toString() : '-';
                    const monthText = event.month ? event.month.toString() : '-';
                    const eventTitle = event.eventTitle || 'できごと';
                    console.log(`📊 Event ${idx + 1}:`, yearText, monthText, eventTitle);
                    doc.fontSize(9).font('JapaneseFont').fillColor('#000000');
                    doc.text(yearText, col1X, currentY, { width: 60 });
                    doc.text(monthText, col2X, currentY, { width: 60 });
                    doc.text(eventTitle, col3X, currentY, { width: 300 });
                    currentY += rowHeight + 5;
                });
            }
            else {
                console.warn('⚠️ No important events');
                doc.fontSize(9).font('JapaneseFont').fillColor('#999999');
                doc.text('（重要なできごとが記録されていません）', col1X, currentY);
            }
            console.log('✅ PDF content generated');
            doc.end();
        }
        catch (error) {
            console.error('❌ Error during PDF generation:', error);
            doc.end();
            reject(error);
        }
    });
}
export default router;
//# sourceMappingURL=pdf.js.map