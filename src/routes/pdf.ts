import express, { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';

const router = express.Router();

// PDF生成エンドポイント
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const db = getDb();

    // ユーザーデータ取得
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // タイムラインデータ取得（編集済みのテキスト）
    const timelines = db.prepare(`
      SELECT * FROM timeline 
      WHERE user_id = ? 
      ORDER BY year ASC, month ASC
    `).all(userId) as any[];

    // PDF生成
    const pdfBuffer = await generatePDF(user, timelines, db);

    // PDF保存
    const pdfDir = path.join(process.cwd(), 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const timestamp = Date.now();
    const pdfFilename = `jibunshi_${userId}_${timestamp}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFilename);

    fs.writeFileSync(pdfPath, pdfBuffer);

    // PDFバージョン記録
    db.prepare(`
      INSERT INTO pdf_versions (user_id, file_path, filename, version, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, pdfPath, pdfFilename, 1);

    res.json({
      success: true,
      pdfId: timestamp,
      filename: pdfFilename,
      downloadUrl: `/api/pdf/${timestamp}/download`
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// PDFダウンロードエンドポイント
router.get('/:pdfId/download', async (req: Request, res: Response) => {
  try {
    const { pdfId } = req.params;
    const db = getDb();

    // PDFファイル情報取得
    const pdfRecord = db.prepare(`
      SELECT * FROM pdf_versions 
      WHERE created_at LIKE ? 
      LIMIT 1
    `).get(`%${pdfId}%`) as any;

    if (!pdfRecord || !fs.existsSync(pdfRecord.file_path)) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdfBuffer = fs.readFileSync(pdfRecord.file_path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfRecord.filename}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({ error: 'PDF download failed' });
  }
});

// PDF生成メイン処理
async function generatePDF(user: any, timelines: any[], db: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // ===== 表紙 =====
      doc.fontSize(28).font('Helvetica-Bold').text('📖 自分史', { align: 'center' });
      doc.moveDown();
      doc.fontSize(18).font('Helvetica').text(user.name || 'ユーザー名未設定', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(`年齢: ${user.age || '未設定'}歳`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).fillColor('#666666').text(`生成日: ${new Date().toLocaleDateString('ja-JP')}`, { align: 'center' });

      doc.addPage();

      // ===== 本文：タイムラインごとのコンテンツ =====
      timelines.forEach((timeline, index) => {
        // セクションタイトル
        doc.fontSize(16).fillColor('#000000').font('Helvetica-Bold')
          .text(`${timeline.year}年${timeline.month ? `${timeline.month}月` : ''}`, { underline: true });
        doc.moveDown(0.3);

        // ターニングポイント
        if (timeline.turning_point) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
            .text('ターニングポイント: ', { continued: true })
            .font('Helvetica').text(timeline.turning_point);
          doc.moveDown(0.3);
        }

        // 編集済みコンテンツ or オリジナル説明
        const content = timeline.edited_content || timeline.event_description || '';
        doc.fontSize(11).font('Helvetica').fillColor('#000000').text(content, {
          align: 'left',
          width: 495
        });

        // 写真を取得して挿入
        const photos = db.prepare(`
          SELECT * FROM timeline_photos 
          WHERE timeline_id = ? 
          LIMIT 5
        `).all(timeline.id) as any[];

        if (photos.length === 0) {
          // timeline_photosにない場合、photosテーブルから取得
          const backupPhotos = db.prepare(`
            SELECT * FROM photos 
            WHERE timeline_id = ? 
            LIMIT 5
          `).all(timeline.id) as any[];

          if (backupPhotos.length > 0) {
            doc.moveDown(0.3);
            backupPhotos.forEach((photo: any) => {
              insertPhoto(doc, photo.file_path, photo.description);
            });
          }
        } else {
          doc.moveDown(0.3);
          photos.forEach((photo: any) => {
            insertPhoto(doc, photo.file_path, photo.description);
          });
        }

        doc.moveDown(0.5);

        // ページ判定
        if (index < timelines.length - 1 && doc.y > 700) {
          doc.addPage();
        }
      });

      // ===== 年表（最後のページ） =====
      if (timelines.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('📊 人生年表', { underline: true });
        doc.moveDown(0.3);

        const tableTop = doc.y;
        const col1X = 60;
        const col2X = 150;
        const col3X = 300;
        const rowHeight = 20;

        // ヘッダー
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('年', col1X, tableTop);
        doc.text('月', col2X, tableTop);
        doc.text('できごと', col3X, tableTop);

        // 区切り線
        doc.strokeColor('#cccccc').moveTo(col1X, tableTop + 15).lineTo(500, tableTop + 15).stroke();

        let currentY = tableTop + 20;

        timelines.forEach((timeline: any) => {
          const yearText = timeline.year ? timeline.year.toString() : '-';
          const monthText = timeline.month ? timeline.month.toString() : '-';
          const eventText = timeline.turning_point || '-';

          doc.fontSize(9).font('Helvetica').fillColor('#000000');
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

      // フッター（ページ番号）
      const pages = doc.bufferedPageRange().count;
      for (let i = 0; i < pages; i++) {
        doc.switchToPage(i);
        doc.fontSize(10).fillColor('#999999').text(
          `ページ ${i + 1} / ${pages}`,
          50,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// 写真挿入ヘルパー関数
function insertPhoto(doc: any, photoPath: string, description: string) {
  try {
    if (!photoPath || !fs.existsSync(photoPath)) {
      return;
    }

    const fileSize = fs.statSync(photoPath).size;
    if (fileSize === 0) {
      return;
    }

    // 写真のサイズを制限
    const maxWidth = 400;
    const maxHeight = 250;

    doc.image(photoPath, {
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

  } catch (error) {
    console.error(`Error inserting photo ${photoPath}:`, error);
  }
}

export default router;
