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
// POST /api/pdf/generate - PDFを生成
// ============================================
router.post('/generate', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const userId = user.userId;
        // ✅ フロントから送られたデータを受け取る
        const { answersWithPhotos, timelines: requestTimelines, editedContent } = req.body;
        console.log('📄 PDF generation request - userId:', userId);
        console.log('📥 Request data:', {
            answersWithPhotosLength: answersWithPhotos?.length || 0,
            timelinesLength: requestTimelines?.length || 0,
            editedContentLength: editedContent?.length || 0 // ✅ 新：editedContent の長さをログ
        });
        const db = getDb();
        // ✅ ユーザーデータ取得
        const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!userRecord) {
            console.error('❌ User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        // ✅ 修正：editedContent を最優先使用
        // フロントから送られた editedContent（修正テキスト）を優先使用
        let biographyContent = '';
        // ✅ 優先順位：1) editedContent（修正テキスト） > 2) biography table > 3) answersWithPhotos
        if (editedContent && editedContent.trim().length > 0) {
            // ✅ 修正テキストを使用（最優先）
            biographyContent = editedContent;
            console.log('✅ Using editedContent from frontend (修正テキスト) - length:', biographyContent.length);
        }
        else if (answersWithPhotos && answersWithPhotos.length > 0) {
            // フォールバック：biography テーブルから取得を試みる
            const biography = db.prepare(`
        SELECT id, edited_content 
        FROM biography 
        WHERE user_id = ?
      `).get(userId);
            if (biography && biography.edited_content && biography.edited_content.trim().length > 0) {
                biographyContent = biography.edited_content;
                console.log('✅ Using biography table (修正済みテキスト) - length:', biographyContent.length);
            }
            else {
                // 最後の手段：answersWithPhotos を使用
                biographyContent = answersWithPhotos
                    .map((answer) => answer.text || '')
                    .filter((text) => text.trim())
                    .join('\n\n');
                console.log('⚠️ Fallback to answersWithPhotos from frontend - length:', biographyContent.length);
            }
        }
        else {
            // biography テーブルから取得
            const biography = db.prepare(`
        SELECT id, edited_content 
        FROM biography 
        WHERE user_id = ?
      `).get(userId);
            if (biography && biography.edited_content) {
                biographyContent = biography.edited_content;
                console.log('✅ Using biography table - length:', biographyContent.length);
            }
            else {
                console.warn('⚠️ No biography content available');
                return res.status(400).json({ error: 'No biography content available' });
            }
        }
        // ✅ content が null でない、かつ UTF-8 文字列であることを確認
        if (typeof biographyContent !== 'string') {
            console.warn('⚠️ Biography content is not a string, converting:', typeof biographyContent);
            biographyContent = String(biographyContent);
        }
        console.log('📖 Biography content - length:', biographyContent.length, 'first 100 chars:', biographyContent.substring(0, 100));
        // ✅ 修正: timeline_photos から写真を取得（biography_photos ではなく）
        console.log('📸 Fetching timeline photos for user:', userId);
        const photos = db.prepare(`
      SELECT file_path, description
      FROM timeline_photos
      WHERE timeline_id IN (
        SELECT id FROM timeline WHERE user_id = ? AND is_auto_generated = 1
      )
      ORDER BY display_order ASC
      LIMIT 20
    `).all(userId);
        console.log('🖼️ Photos found:', photos.length);
        // ✅ 修正：フロントから送られた timelines を優先使用
        // フォールバック：requestTimelines がない場合はデータベースから取得
        let timelines = [];
        let importantEvents = [];
        if (requestTimelines && requestTimelines.length > 0) {
            // ✅ フロントから送られたtimelineデータを使用（最新）
            timelines = requestTimelines;
            console.log('✅ Using timelines from frontend - count:', timelines.length);
            // timelineから importantEvents を構築
            timelines.forEach((timeline, idx) => {
                importantEvents.push({
                    year: timeline.year || '-',
                    month: timeline.month || '-',
                    eventTitle: timeline.event_title || timeline.eventTitle || `できごと${idx + 1}`
                });
                console.log(`📍 Timeline ${idx + 1}: year=${timeline.year}, month=${timeline.month}, title=${timeline.event_title || timeline.eventTitle}`);
            });
        }
        else {
            // フォールバック：データベースから取得
            console.log('📊 Fetching timeline data from database for user:', userId);
            timelines = db.prepare(`
        SELECT id, year, month, event_title, event_description
        FROM timeline
        WHERE user_id = ? AND year IS NOT NULL
        ORDER BY year ASC, month ASC
      `).all(userId);
            console.log('📚 Found timeline records:', timelines.length);
            // ✅ timeline から importantEvents を構築
            if (timelines && timelines.length > 0) {
                timelines.forEach((timeline, idx) => {
                    importantEvents.push({
                        year: timeline.year || '-',
                        month: timeline.month || '-',
                        eventTitle: timeline.event_title || `できごと${idx + 1}`
                    });
                    console.log(`📍 Timeline ${idx + 1}: year=${timeline.year}, month=${timeline.month}, title=${timeline.event_title}`);
                });
            }
        }
        console.log('📊 Total important events to display:', importantEvents.length);
        // ============================================
        // PDFを生成（biography + timelineMetadata を統合）
        // ============================================
        const pdfBuffer = await generatePDF(userRecord, biographyContent, photos, importantEvents);
        // PDFをレスポンスで返す
        const filename = `autobiography_${userId}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
        console.log('✅ PDF response sent:', filename, 'size:', pdfBuffer.length, 'bytes');
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
        // セキュリティチェック
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
// PDFを生成するメイン処理
// ============================================
async function generatePDF(user, biographyContent, photos, importantEvents) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40,
            bufferPages: true,
        });
        // ============================================
        // フォント設定
        // ============================================
        const fontPath = path.join(__dirname, '../../fonts/NotoSansJP-Regular.ttf');
        console.log('📁 Font path construction:');
        console.log('   __dirname:', __dirname);
        console.log('   Full path:', fontPath);
        console.log('   Exists:', fs.existsSync(fontPath));
        let fontLoaded = false;
        if (fs.existsSync(fontPath)) {
            try {
                doc.registerFont('JapaneseFont', fontPath);
                fontLoaded = true;
                console.log('✅ JapaneseFont registered successfully');
            }
            catch (fontError) {
                console.error('❌ Failed to register font:', fontError);
                // フォント登録失敗時は Helvetica にフォールバック
                fontLoaded = false;
            }
        }
        else {
            console.warn('⚠️ Font file not found at:', fontPath);
            console.log('   Falling back to Helvetica (English only)');
        }
        const buffer = [];
        doc.on('data', (chunk) => {
            buffer.push(chunk);
        });
        doc.on('end', () => {
            resolve(Buffer.concat(buffer));
        });
        doc.on('error', (error) => {
            console.error('❌ PDF document error:', error);
            reject(error);
        });
        try {
            // ============================================
            // ページ1: 表紙
            // ============================================
            const titleFont = fontLoaded ? 'JapaneseFont' : 'Helvetica';
            doc.fontSize(28).font(titleFont).text('📖 わたしの自分史', { align: 'center' });
            doc.moveDown(2);
            doc.fontSize(18).font(titleFont).text(user.name || '（名前未設定）', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(14).font(titleFont).fillColor('#666666').text(`年齢: ${user.age || '未設定'}歳`, { align: 'center' });
            doc.moveDown(3);
            doc.fontSize(12).font(titleFont).fillColor('#999999').text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'center' });
            // ============================================
            // ページ2: 自分史物語
            // ============================================
            doc.addPage();
            doc.fontSize(18).font(titleFont).fillColor('#2c3e50').text('📚 わたしの人生物語', { underline: true });
            doc.moveDown(1);
            // ✅ 修正: biographyContent の UTF-8 安全性を確認
            if (biographyContent && biographyContent.trim()) {
                console.log('📝 Rendering biography content - length:', biographyContent.length);
                doc.fontSize(11).font(titleFont).fillColor('#000000');
                // ✅ 修正: テキスト描画時の width を指定して折り返しを制御
                doc.text(biographyContent, {
                    align: 'left',
                    width: 500,
                    lineGap: 4
                });
            }
            else {
                console.warn('⚠️ No biography content to display');
            }
            // ============================================
            // 写真セクション
            // ============================================
            if (photos && photos.length > 0) {
                console.log('🖼️ Adding photos section - count:', photos.length);
                doc.addPage();
                doc.fontSize(16).font(titleFont).fillColor('#2c3e50').text('📷 思い出の写真', { underline: true });
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
                            // ✅ Base64データの場合
                            isBase64 = true;
                            photoPath = photo.file_path;
                        }
                        else {
                            // ✅ 修正: file_path はファイル名のみなので、動的にパスを構築
                            const fullPhotoPath = path.join(__dirname, '../../uploads', photo.file_path);
                            if (fs.existsSync(fullPhotoPath)) {
                                photoPath = fullPhotoPath;
                            }
                            else {
                                // フォールバック: DB に保存されたパスがそのまま絶対パスの可能性
                                if (fs.existsSync(photo.file_path)) {
                                    photoPath = photo.file_path;
                                }
                            }
                        }
                        if (!photoPath) {
                            console.warn('⚠️ Photo skipped - invalid path:', photo.file_path?.substring(0, 50));
                            return;
                        }
                        const x = 50;
                        const y = 80 + (pagePhotoCount * 180);
                        const maxWidth = 500;
                        const maxHeight = 150;
                        if (isBase64) {
                            const base64Data = photoPath.replace(/^data:image\/\w+;base64,/, '');
                            const photoBuffer = Buffer.from(base64Data, 'base64');
                            doc.image(photoBuffer, x, y, {
                                fit: [maxWidth, maxHeight],
                                align: 'center'
                            });
                            console.log('🔸 Base64 photo rendered - index:', photoIdx);
                        }
                        else {
                            doc.image(photoPath, x, y, {
                                fit: [maxWidth, maxHeight],
                                align: 'center'
                            });
                            console.log('🔸 File photo rendered - index:', photoIdx, 'path:', photoPath);
                        }
                        pagePhotoCount++;
                    }
                    catch (photoError) {
                        console.warn('⚠️ Photo render error:', {
                            index: photoIdx,
                            error: photoError?.message,
                            path: photo.file_path?.substring(0, 50)
                        });
                    }
                });
            }
            // ============================================
            // 最後のページ: 人生年表
            // ============================================
            doc.addPage();
            doc.fontSize(16).font(titleFont).fillColor('#2c3e50').text('📊 人生年表', { underline: true });
            doc.moveDown(0.5);
            const tableTop = doc.y;
            const col1X = 60;
            const col2X = 130;
            const col3X = 200;
            const rowHeight = 20;
            // テーブルヘッダー
            doc.fontSize(10).font(titleFont).fillColor('#333333');
            doc.text('年', col1X, tableTop, { width: 60 });
            doc.text('月', col2X, tableTop, { width: 60 });
            doc.text('できごと', col3X, tableTop, { width: 300 });
            // 区切り線
            doc.strokeColor('#cccccc').moveTo(col1X, tableTop + 15).lineTo(550, tableTop + 15).stroke();
            let currentY = tableTop + 20;
            // ✅ 修正: importantEvents の表示とエラーハンドリング
            if (importantEvents && importantEvents.length > 0) {
                console.log('📊 Rendering important events:', importantEvents.length);
                importantEvents.forEach((event, idx) => {
                    const yearText = event.year ? event.year.toString() : '-';
                    const monthText = event.month ? event.month.toString() : '-';
                    const eventTitle = event.eventTitle || event.event_title || 'イベント';
                    console.log(`📝 Event ${idx + 1}:`, {
                        year: yearText,
                        month: monthText,
                        title: eventTitle
                    });
                    doc.fontSize(9).font(titleFont).fillColor('#000000');
                    doc.text(yearText, col1X, currentY, { width: 60 });
                    doc.text(monthText, col2X, currentY, { width: 60 });
                    doc.text(eventTitle, col3X, currentY, { width: 300 });
                    currentY += rowHeight + 5;
                });
            }
            else {
                console.warn('⚠️ No important events to display');
                doc.fontSize(9).font(titleFont).fillColor('#999999');
                doc.text('（重要なできごとが記録されていません）', col1X, currentY);
            }
            console.log('✅ PDF content generation completed successfully');
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
//# sourceMappingURL=Oldpdf.js.map