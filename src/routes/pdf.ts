import express, { Request, Response } from 'express';
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
const authenticate = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (!token) {
    return res.status(401).json({ error: '認証が必要です。トークンが見つかりません。' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '無効または期限切れのトークンです。' });
  }

  (req as any).user = decoded;
  next();
};

// PDF生成エンドポイント
router.post('/generate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;

    console.log('📄 PDF generation request - userId:', userId);

    const db = getDb();

    // ユーザーデータ取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    console.log('👤 User record:', userRecord);
    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ タイムラインデータ取得（すべて取得）
    const timelines = db.prepare(`
      SELECT * FROM timeline 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    console.log('📊 Found', timelines.length, 'timeline entries');

    if (timelines.length === 0) {
      console.warn('⚠️ No timeline data found for PDF generation');
      return res.status(400).json({ error: 'No timeline data available for PDF generation' });
    }

    // ✅ タイムラインのデータを確認
    const firstTimeline = timelines[0];
    console.log('🔍 Timeline content check:', {
      id: firstTimeline.id,
      title: firstTimeline.event_title,
      year: firstTimeline.year,
      month: firstTimeline.month,
      hasEditedContent: !!firstTimeline.edited_content,
      editedContentLength: firstTimeline.edited_content?.length || 0,
      hasEventDescription: !!firstTimeline.event_description,
      eventDescriptionLength: firstTimeline.event_description?.length || 0
    });

    // タイムラインに紐付いている写真を取得
    let photos = db.prepare(`
      SELECT 
        id,
        file_path,
        description
      FROM timeline_photos
      WHERE timeline_id = ?
      ORDER BY display_order ASC, created_at ASC
    `).all(firstTimeline.id) as any[];

    if (photos.length > 0) {
      console.log('📸 Timeline', firstTimeline.id, 'has', photos.length, 'photos');
    }

    const timelinesWithPhotos = [{
      ...firstTimeline,
      photos
    }];

    // PDF生成
    const pdfBuffer = await generatePDF(userRecord, timelinesWithPhotos, db, userId);

    // PDF保存
    const pdfDir = path.join(__dirname, '../pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const filename = `autobiography_${userId}_${Date.now()}.pdf`;
    const filepath = path.join(pdfDir, filename);

    fs.writeFileSync(filepath, pdfBuffer);
    console.log('✅ PDF saved:', filepath);

    // DB に PDF 記録を保存
    db.prepare(`
      INSERT INTO pdf_versions (user_id, file_path, filename, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(userId, `/pdfs/${filename}`, filename, 1, 'generated');

    res.json({
      success: true,
      message: 'PDF generated successfully',
      filename: filename,
      filepath: `/pdfs/${filename}`
    });

  } catch (error: any) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PDF ダウンロードエンドポイント
router.get('/download/:filename', authenticate, (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();

    console.log('📥 PDF download request - userId:', userId, 'filename:', filename);

    // セキュリティ: ユーザーが所有する PDF か確認
    const pdfRecord = db.prepare(
      'SELECT * FROM pdf_versions WHERE user_id = ? AND filename = ?'
    ).get(userId, filename) as any;

    if (!pdfRecord) {
      console.warn('⚠️ PDF not found or not owned by user');
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdfPath = path.join(__dirname, '../pdfs', filename);

    if (!fs.existsSync(pdfPath)) {
      console.error('❌ PDF file not found on disk:', pdfPath);
      return res.status(404).json({ error: 'PDF file not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(pdfPath);

    console.log('✅ PDF downloaded successfully');
  } catch (error: any) {
    console.error('❌ PDF download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PDF リスト取得
router.get('/list', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();

    console.log('📋 PDF list request - userId:', userId);

    const pdfs = db.prepare(`
      SELECT * FROM pdf_versions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    console.log('✅ Found', pdfs.length, 'PDFs');
    res.json(pdfs);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PDF 生成メイン処理
// ============================================
async function generatePDF(user: any, timelinesWithPhotos: any[], db: any, userId: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    // フォント設定
    const fontPath = path.join(__dirname, '../fonts/NotoSansJP-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('JapaneseFont', fontPath);
    } else {
      console.warn('⚠️ Japanese font not found, using default');
      doc.registerFont('JapaneseFont', 'Helvetica');
    }

    const buffer: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => {
      buffer.push(chunk);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(buffer));
    });

    doc.on('error', (error: any) => {
      console.error('❌ PDF generation error:', error);
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
      // ページ2以降: 自分史コンテンツ
      // ============================================
      timelinesWithPhotos.forEach((firstTimeline, index) => {
        doc.addPage();

        // タイトル
        doc.fontSize(18).font('JapaneseFont').fillColor('#2c3e50').text('📚 わたしの人生物語', { underline: true });
        doc.moveDown(1);

        // 内容
        if (firstTimeline.edited_content && firstTimeline.edited_content.trim()) {
          doc.fontSize(11).font('JapaneseFont').fillColor('#000000');
          doc.text(firstTimeline.edited_content, {
            align: 'left',
            width: 500,
            height: 300,
            overflow: 'hidden'
          });
        } else if (firstTimeline.event_description && firstTimeline.event_description.trim()) {
          doc.fontSize(11).font('JapaneseFont').fillColor('#000000');
          doc.text(firstTimeline.event_description, {
            align: 'left',
            width: 500,
            height: 300,
            overflow: 'hidden'
          });
        }

        doc.moveDown(2);

        // 写真セクション
        if (firstTimeline.photos && firstTimeline.photos.length > 0) {
          doc.addPage();
          doc.fontSize(16).font('JapaneseFont').text('📷 思い出の写真', { underline: true });
          doc.moveDown(1);

          const photosPerPage = 4;
          let photoCount = 0;

          firstTimeline.photos.forEach((photo: any, photoIdx: number) => {
            if (photoCount >= photosPerPage) {
              doc.addPage();
              photoCount = 0;
            }

            try {
              const photoPath = photo.file_path.startsWith('data:') 
                ? photo.file_path 
                : path.join(__dirname, '../', photo.file_path);

              if (photo.file_path.startsWith('data:')) {
                const base64Data = photo.file_path.replace(/^data:image\/\w+;base64,/, '');
                const photoBuffer = Buffer.from(base64Data, 'base64');
                
                const x = 50;
                const y = 100 + (photoCount * 150);
                doc.image(photoBuffer, x, y, { width: 500, height: 120, fit: [500, 120] });

                if (photo.description) {
                  doc.fontSize(9).font('JapaneseFont').fillColor('#666666');
                  doc.text(photo.description, x, y + 130, { width: 500 });
                }

                photoCount++;
              } else if (fs.existsSync(photoPath)) {
                const x = 50;
                const y = 100 + (photoCount * 150);
                doc.image(photoPath, x, y, { width: 500, height: 120, fit: [500, 120] });

                if (photo.description) {
                  doc.fontSize(9).font('JapaneseFont').fillColor('#666666');
                  doc.text(photo.description, x, y + 130, { width: 500 });
                }

                photoCount++;
              }
            } catch (photoError) {
              console.warn('⚠️ Photo processing error:', photoError);
            }
          });
        }
      });

      // ============================================
      // 最後のページ：人生年表
      // ============================================
      doc.addPage();
      doc.fontSize(16).font('JapaneseFont').text('📊 人生年表', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const col1X = 60;
      const col2X = 150;
      const col3X = 300;
      const rowHeight = 20;

      // ヘッダー
      doc.fontSize(10).font('JapaneseFont').fillColor('#333333');
      doc.text('年', col1X, tableTop);
      doc.text('月', col2X, tableTop);
      doc.text('できごと', col3X, tableTop);

      // 区切り線
      doc.strokeColor('#cccccc').moveTo(col1X, tableTop + 15).lineTo(500, tableTop + 15).stroke();

      let currentY = tableTop + 20;

      // ✅ 修正: すべてのAI生成タイムラインを取得（LIMIT 1 を削除）
      const allAITimelines = db.prepare(`
        SELECT * FROM timeline 
        WHERE user_id = ? AND is_auto_generated = 1
        ORDER BY year ASC, month ASC
      `).all(userId) as any[];

      console.log('📊 人生年表用タイムライン数:', allAITimelines.length);

      if (allAITimelines && allAITimelines.length > 0) {
        // ✅ 修正: 複数行をループ処理
        allAITimelines.forEach((timelineEntry: any, entryIndex: number) => {
          const yearText = timelineEntry.year ? timelineEntry.year.toString() : '-';
          const monthText = timelineEntry.month ? timelineEntry.month.toString() : '-';
          
          let eventText = '';
          if (timelineEntry.edited_content && timelineEntry.edited_content.trim() !== '') {
            eventText = timelineEntry.edited_content.length > 150 
              ? timelineEntry.edited_content.substring(0, 150) + '...' 
              : timelineEntry.edited_content;
          } else if (timelineEntry.event_description && timelineEntry.event_description.trim() !== '') {
            eventText = timelineEntry.event_description.length > 150 
              ? timelineEntry.event_description.substring(0, 150) + '...' 
              : timelineEntry.event_description;
          } else {
            eventText = timelineEntry.event_title || '（内容なし）';
          }

          console.log('📊 人生年表行を追加:', { 
            index: entryIndex,
            yearText, 
            monthText, 
            eventTextLength: eventText.length 
          });

          doc.fontSize(9).font('JapaneseFont').fillColor('#000000');
          doc.text(yearText, col1X, currentY, { width: 80 });
          doc.text(monthText, col2X, currentY, { width: 80 });
          doc.text(eventText, col3X, currentY, { width: 200, height: rowHeight });

          currentY += rowHeight + 5;  // 行間を追加
        });
      } else {
        console.warn('⚠️ AI生成タイムラインが見つかりません');
        doc.fontSize(9).font('JapaneseFont').fillColor('#999999');
        doc.text('（AI生成記録がありません）', col1X, currentY);
      }

      currentY += rowHeight;

      // ✨ PDF完成
      console.log('✅ PDF content generated successfully');
      doc.end();

    } catch (error: any) {
      console.error('❌ Error during PDF generation:', error);
      doc.end();
      reject(error);
    }
  });
}

export default router;
