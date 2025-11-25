import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { verifyToken, extractToken } from '../utils/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

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

// ============================================
// Multer設定
// ============================================
const uploadDir = path.join(__dirname, '../../uploads');

// uploadsフォルダが存在しなければ作成
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF images are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
  },
});

// ============================================
// GET /api/photos - ユーザーの写真一覧取得（認証必須）
// ============================================
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { userId } = req.query;

    // 指定されたuserIdが自分のIDと一致するか確認
    if (userId && parseInt(userId as string) !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // 認証ユーザーの写真のみ取得
    const stmt = db.prepare('SELECT * FROM photos WHERE user_id = ? ORDER BY uploaded_at DESC');
    const photos = stmt.all(user.userId);
    res.json(photos);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: '写真一覧の取得に失敗しました。' });
  }
});

// ============================================
// GET /api/photos/:id - 特定の写真取得（認証必須、本人のみ）
// ============================================
router.get('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const stmt = db.prepare('SELECT * FROM photos WHERE id = ?');
    const photo = stmt.get(id) as any;

    if (!photo) {
      return res.status(404).json({ error: '写真が見つかりません。' });
    }

    // 本人確認
    if (photo.user_id !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    res.json(photo);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: '写真の取得に失敗しました。' });
  }
});

// ============================================
// POST /api/photos - 写真アップロード（認証必須）
// ============================================
router.post('/', authenticate, upload.single('file'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
    }

    const { userId, stage, description } = req.body;

    // 本人確認
    if (!userId || parseInt(userId) !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const filePath = `/uploads/${req.file.filename}`;

    const stmt = db.prepare(
      `INSERT INTO photos (user_id, filename, file_path, stage, description)
       VALUES (?, ?, ?, ?, ?)`
    );

    const result = stmt.run(userId, req.file.filename, filePath, stage || null, description || null);

    res.status(201).json({
      id: result.lastInsertRowid,
      user_id: userId,
      filename: req.file.filename,
      file_path: filePath,
      stage,
      description,
      uploaded_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: '写真のアップロードに失敗しました。' });
  }
});

// ============================================
// DELETE /api/photos/:id - 写真削除（認証必須、本人のみ）
// ============================================
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as any;

    if (!photo) {
      return res.status(404).json({ error: '写真が見つかりません。' });
    }

    // 本人確認
    if (photo.user_id !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // ファイルを削除
    const filePath = path.join(__dirname, '../../' + photo.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // DBから削除
    const stmt = db.prepare('DELETE FROM photos WHERE id = ?');
    stmt.run(id);

    res.json({ message: '写真が削除されました。' });
  } catch (error: any) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ error: '写真の削除に失敗しました。' });
  }
});

export default router;