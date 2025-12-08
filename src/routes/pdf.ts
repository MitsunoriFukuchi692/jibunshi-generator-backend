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
    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // タイムラインデータ取得（編集済みのテキスト）
    const timelines = db.prepare(`
      SELECT * FROM timeline 
      WHERE user_id = ? 
      ORDER BY year ASC, month ASC
    `).all(userId) as any[];

    console.log('📊 Found', timelines.length, 'timeline entries');

    if (timelines.length === 0) {
      console.warn('⚠️ No timeline data found for PDF generation');
      return res.status(400).json({ error: 'No timeline data available for PDF generation' });
    }

    // タイムラインごとに写真を取得
    const timelinesWithPhotos = timelines.map((timeline: any) => {
      const photos = db.prepare(`
        SELECT 
          id,
          file_path,
          description
        FROM timeline_photos
        WHERE timeline_id = ?
        ORDER BY created_at ASC
      `).all(timeline.id) as any[];

      return {
        ...timeline,
        photos
      };
    });

    // PDF生成
    const pdfBuffer = await generatePDF(userRecord, timelinesWithPhotos, db);

    // PDF保存
    const pdfDir = path.join(process.cwd(), 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
      console.log('✅ Created pdfs directory');
    }

    const timestamp = Date.now();
    const pdfFilename = `jibunshi_${userId}_${timestamp}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFilename);

    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log('✅ PDF saved:', pdfPath);

    // PDFバージョン記録
    const insertStmt = db.prepare(`
      INSERT INTO pdf_versions (user_id, file_path, filename, version, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    const result = insertStmt.run(userId, pdfPath, pdfFilename, 1);
    console.log('✅ PDF version recorded - id:', result.lastInsertRowid);

    res.json({
      success: true,
      message: 'PDF generated successfully',
      pdfId: result.lastInsertRowid,
      filename: pdfFilename,
      downloadUrl: `/api/pdf/${result.lastInsertRowid}/download`
    });

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ 
      error: 'PDF generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PDFダウンロードエンドポイント
router.get('/:pdfId/download', async (req: Request, res: Response) => {
  try {
    const { pdfId } = req.params;
    const db = getDb();

    console.log('📥 PDF download request - pdfId:', pdfId);

    // PDFファイル情報取得（ID で直接検索）
    const pdfRecord = db.prepare(`
      SELECT * FROM pdf_versions 
      WHERE id = ?
      LIMIT 1
    `).get(pdfId) as any;

    console.log('🔍 PDF record found:', !!pdfRecord);

    if (!pdfRecord) {
      console.error('❌ PDF record not found in DB - pdfId:', pdfId);
      return res.status(404).json({ error: 'PDF not found' });
    }

    if (!fs.existsSync(pdfRecord.file_path)) {
      console.error('❌ PDF file not found on disk:', pdfRecord.file_path);
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }

    const pdfBuffer = fs.readFileSync(pdfRecord.file_path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfRecord.filename}"`);
    res.send(pdfBuffer);

    console.log('✅ PDF downloaded successfully');

  } catch (error) {
    console.error('❌ PDF download error:', error);
    res.status(500).json({ 
      error: 'PDF download failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PDF生成メイン処理
async function generatePDF(user: any, timelinesWithPhotos: any[], db: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // 日本語フォント（Windowsシステムフォント）を使用
      try {
        const fontPath = 'C:\\Windows\\Fonts\\NotoSansJP-VF.ttf';
        doc.registerFont('JapaneseFont', fontPath);
        doc.font('JapaneseFont');
        console.log('✅ Japanese font loaded');
      } catch (e) {
        console.warn('⚠️ Japanese font not available:', e);
        doc.font('Helvetica');
      }

      // ===== 表紙 =====
      doc.fontSize(28).font('JapaneseFont').text('📖 自分史', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(16).font('Helvetica').text('(My Life Story)', { align: 'center' });
      doc.moveDown();
      doc.fontSize(18).font('JapaneseFont').text(user.name || 'ユーザー名未設定', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('JapaneseFont').text(`年齢: ${user.age || '未設定'}歳`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).fillColor('#666666').font('JapaneseFont').text(`生成日: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'center' });

      doc.addPage();

      // ===== 本文：タイムラインごとのコンテンツ =====
      timelinesWithPhotos.forEach((timeline, index) => {
        // ページが満杯の場合、新しいページを追加
        if (doc.y > 650) {
          doc.addPage();
        }

        // セクションタイトル
        doc.fontSize(16).fillColor('#000000').font('JapaneseFont')
          .text(`${timeline.year}年${timeline.month ? `${timeline.month}月` : ''}`, { underline: true });
        doc.moveDown(0.3);

        // ターニングポイント
        if (timeline.turning_point) {
          doc.fontSize(11).font('JapaneseFont').fillColor('#333333')
            .text('ターニングポイント: ', { continued: true })
            .font('JapaneseFont').text(timeline.turning_point);
          doc.moveDown(0.3);
        }

        // 編集済みコンテンツ or オリジナル説明
        const content = timeline.edited_content || timeline.event_description || '';
        doc.fontSize(11).font('JapaneseFont').fillColor('#000000').text(content, {
          align: 'left',
          width: 495
        });

        // 紐付いている写真を挿入
        if (timeline.photos && timeline.photos.length > 0) {
          doc.moveDown(0.3);
          console.log('📸 Found', timeline.photos.length, 'photos for timeline', timeline.id);

          timeline.photos.forEach((photo: any) => {
            // ページが満杯の場合、新しいページを追加
            if (doc.y > 700) {
              doc.addPage();
            }
            insertPhoto(doc, photo.file_path, photo.description);
          });
        }

        doc.moveDown(0.5);
      });

      // ===== 年表（最後のページ） =====
      if (timelinesWithPhotos.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('JapaneseFont').text('📊 人生年表', { underline: true });
        doc.moveDown(0.3);

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

        timelinesWithPhotos.forEach((timeline: any) => {
          const yearText = timeline.year ? timeline.year.toString() : '-';
          const monthText = timeline.month ? timeline.month.toString() : '-';
          const eventText = timeline.turning_point || '-';

          doc.fontSize(9).font('JapaneseFont').fillColor('#000000');
          doc.text(yearText, col1X, currentY, { width: 80 });
          doc.text(monthText, col2X, currentY, { width: 80 });
          doc.text(eventText, col3X, currentY, { width: 200, height: rowHeight });

          currentY += rowHeight;

          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
          }
        });
      }

      // ✨ PDF完成
      console.log('✅ PDF content generated successfully');

      doc.end();

    } catch (error) {
      console.error('❌ PDF generation error details:', error);
      reject(error);
    }
  });
}

// 写真挿入ヘルパー関数
function insertPhoto(doc: any, photoPath: string, description: string) {
  try {
    // photoPath がサーバー内のパス（e.g., `/uploads/...`) の場合、フルパスに変換
    let fullPath = photoPath;
    if (photoPath.startsWith('/')) {
      fullPath = path.join(process.cwd(), photoPath);
    }

    if (!fullPath || !fs.existsSync(fullPath)) {
      console.warn('⚠️ Photo file not found:', fullPath);
      return;
    }

    const fileSize = fs.statSync(fullPath).size;
    if (fileSize === 0) {
      console.warn('⚠️ Photo file is empty:', fullPath);
      return;
    }

    // 写真のサイズを制限
    const maxWidth = 400;
    const maxHeight = 250;

    doc.image(fullPath, {
      width: maxWidth,
      height: maxHeight,
      align: 'center'
    });

    // 写真の説明
    if (description) {
      doc.fontSize(9).fillColor('#666666').text(description, {
        align: 'center',
        width: 400
      });
    }

    doc.moveDown(0.2);
    console.log('✅ Photo inserted:', fullPath);

  } catch (error) {
    console.error(`⚠️ Error inserting photo ${photoPath}:`, error);
  }
}

export default router;