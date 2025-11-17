import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// ============================================
// Multer設定
// ============================================
const uploadDir = path.join(__dirname, '../../uploads');
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
// GET /api/photos - すべての写真取得
// ============================================
router.get('/', (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    
    if (userId) {
      const stmt = db.prepare('SELECT * FROM photos WHERE user_id = ? ORDER BY uploaded_at DESC');
      const photos = stmt.all(userId);
      return res.json(photos);
    }
    
    const stmt = db.prepare('SELECT * FROM photos ORDER BY uploaded_at DESC');
    const photos = stmt.all();
    res.json(photos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/photos/:id - 特定の写真取得
// ============================================
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM photos WHERE id = ?');
    const photo = stmt.get(id);
    
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json(photo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/photos - 写真アップロード
// ============================================
router.post('/', upload.single('photo'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { userId, stage, description } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
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
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE /api/photos/:id - 写真削除
// ============================================
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM photos WHERE id = ?');
    stmt.run(id);
    res.json({ message: 'Photo deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
