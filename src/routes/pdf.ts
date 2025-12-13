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

    // ✅ タイムラインデータ取得（最新1件のみ）
    const timelines = db.prepare(`
      SELECT * FROM timeline 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
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

      // 日本語フォント（環境に応じて適切なフォントを選択）
      try {
        let fontPath: string;
        const isWindows = process.platform === 'win32';
        
        if (isWindows) {
          fontPath = 'C:\\Windows\\Fonts\\NotoSansJP-VF.ttf';
        } else {
          // Linux: システムフォントまたはプロジェクト内のフォントを使用
          const possiblePaths = [
            '/usr/share/fonts/opentype/noto/NotoSansJP-Regular.otf',
            '/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf',
            path.join(__dirname, '../fonts/NotoSansJP-Regular.ttf'),
            path.join(process.cwd(), 'fonts/NotoSansJP-Regular.ttf'),
          ];
          
          fontPath = '';
          for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
              fontPath = p;
              break;
            }
          }
          
          if (!fontPath) {
            console.warn('⚠️ Japanese font not found in system paths');
            fontPath = '';
          }
        }
        
        if (fontPath && fs.existsSync(fontPath)) {
          doc.registerFont('JapaneseFont', fontPath);
          doc.font('JapaneseFont');
          console.log('✅ Japanese font loaded from:', fontPath);
        } else {
          console.warn('⚠️ Font file not found:', fontPath);
          doc.font('Helvetica');
        }
      } catch (e) {
        console.warn('⚠️ Japanese font loading error:', e);
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

      // ===== 本文：最新の1つのタイムラインのみ =====
      const firstTimeline = timelinesWithPhotos[0];
      
      if (firstTimeline) {
        // ページが満杯の場合、新しいページを追加
        if (doc.y > 650) {
          doc.addPage();
        }

        // セクションタイトル
        doc.fontSize(14).fillColor('#000000').font('JapaneseFont')
          .text('📖 自分史', { underline: true });
        doc.moveDown(0.3);

        // ✅ edited_content があれば、それを優先的に使用（AIが修正したテキスト）
        let contentToDisplay = '';
        if (firstTimeline.edited_content && firstTimeline.edited_content.trim() !== '') {
          console.log('📝 Using edited_content');
          contentToDisplay = firstTimeline.edited_content;
        } else if (firstTimeline.event_description && firstTimeline.event_description.trim() !== '') {
          console.log('📝 Using event_description (fallback)');
          contentToDisplay = firstTimeline.event_description;
        }

        // コンテンツを表示
        if (contentToDisplay) {
          doc.fontSize(11).font('JapaneseFont').fillColor('#000000').text(contentToDisplay, {
            align: 'left',
            width: 495
          });
        } else {
          console.warn('⚠️ No content to display');
          doc.fontSize(11).font('JapaneseFont').fillColor('#999999')
            .text('（コンテンツが入力されていません）');
        }

        // ✅ 紐付いている写真を挿入
        if (firstTimeline.photos && firstTimeline.photos.length > 0) {
          doc.moveDown(0.3);
          console.log('📸 Found', firstTimeline.photos.length, 'photos for timeline', firstTimeline.id);

          firstTimeline.photos.forEach((photo: any) => {
            // ページが満杯の場合、新しいページを追加
            if (doc.y > 700) {
              doc.addPage();
            }
            insertPhoto(doc, photo.file_path, photo.description);
          });
        }

        doc.moveDown(0.5);
      }

      // ===== フッター =====
      doc.fontSize(12).fillColor('#666666').font('JapaneseFont')
        .text('このPDFはAIの支援を受けて作成された自分史です。', { align: 'center' });

      // ✨ PDF完成
      console.log('✅ PDF content generated successfully');

      doc.end();

    } catch (error) {
      console.error('❌ PDF generation error details:', error);
      reject(error);
    }
  });
}

// 写真挿入ヘルパー関数（Base64対応・絶対パス対応）
function insertPhoto(doc: any, photoPath: string, description: string) {
  try {
    if (!photoPath || photoPath.trim() === '') {
      console.warn('⚠️ Photo path is empty');
      return;
    }

    let imageBuffer: Buffer;

    // Base64 形式の写真の場合
    if (photoPath.startsWith('data:image')) {
      console.log('🖼️ Processing Base64 image');
      
      // data:image/png;base64,... の形式から base64 部分を抽出
      const base64Data = photoPath.split(',')[1];
      if (!base64Data) {
        console.warn('⚠️ Invalid Base64 format');
        return;
      }

      imageBuffer = Buffer.from(base64Data, 'base64');

      if (imageBuffer.length === 0) {
        console.warn('⚠️ Base64 image is empty');
        return;
      }

      // 一時ファイルに保存
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `temp_${Date.now()}.png`);
      fs.writeFileSync(tempFilePath, imageBuffer);

      // PDFに挿入
      const maxWidth = 400;
      const maxHeight = 250;

      doc.image(tempFilePath, {
        width: maxWidth,
        height: maxHeight,
        align: 'center'
      });

      // 一時ファイル削除
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.warn('⚠️ Could not delete temp file:', tempFilePath);
      }

      console.log('✅ Base64 image inserted');
    } else {
      // ファイルパスの場合
      let fullPath: string;

      // 絶対パスと相対パスの両方に対応
      if (path.isAbsolute(photoPath)) {
        fullPath = photoPath;
      } else if (photoPath.startsWith('/')) {
        fullPath = path.join(process.cwd(), photoPath);
      } else {
        fullPath = path.join(process.cwd(), photoPath);
      }

      console.log('🔍 Checking photo:', fullPath);

      if (!fs.existsSync(fullPath)) {
        console.error('❌ Photo file NOT FOUND:', fullPath);
        return;
      }

      const fileSize = fs.statSync(fullPath).size;
      if (fileSize === 0) {
        console.warn('⚠️ Photo file is empty:', fullPath);
        return;
      }

      const maxWidth = 400;
      const maxHeight = 250;

      doc.image(fullPath, {
        width: maxWidth,
        height: maxHeight,
        align: 'center'
      });

      console.log('✅ Photo file inserted:', fullPath);
    }

    // 写真の説明
    if (description && description.trim() !== '') {
      doc.fontSize(9).fillColor('#666666').font('JapaneseFont').text(description, {
        align: 'center',
        width: 400
      });
    }

    doc.moveDown(0.2);

  } catch (error) {
    console.error(`⚠️ Error inserting photo:`, error);
  }
}

export default router;
