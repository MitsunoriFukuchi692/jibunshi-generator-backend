import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
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
// GET /api/timeline - timeline 一覧取得（認証必須）
// ============================================
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const { stage } = req.query;
    const user = (req as any).user;

    console.log('📖 Timeline list request - user_id:', user.userId);

    let query = 'SELECT * FROM timeline WHERE user_id = ?';
    const params: any[] = [user.userId];

    if (stage) {
      query += ' AND stage = ?';
      params.push(stage);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = db.prepare(query);
    const timelines = stmt.all(...params) as any[];

    // データを明示的に変換
    const convertedTimelines = timelines.map(item => ({
      id: item.id,
      user_id: item.user_id,
      age: item.age,
      year: item.year,
      stage: item.stage,
      event_title: item.event_title,
      event_description: item.event_description,
      edited_content: item.edited_content,
      is_auto_generated: item.is_auto_generated,
      created_at: item.created_at
    }));

    console.log('✅ Timeline list:', convertedTimelines.length, 'items');
    console.log('📊 Data sample:', JSON.stringify(convertedTimelines[0])); // デバッグ用
    res.json(convertedTimelines);  // ← ここを convertedTimelines に変更
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/timeline - timeline 作成（認証必須）
// ============================================
router.post('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { age, year, stage, event_title, event_description, edited_content } = req.body;

    if (!event_title || !event_description) {
      return res.status(400).json({
        error: 'event_title, event_description are required',
      });
    }

    const stmt = db.prepare(
      `INSERT INTO timeline (user_id, age, year, stage, event_title, event_description, edited_content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const result = stmt.run(
      user.userId,
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      stage || 'turning_points',
      event_title,
      event_description,
      edited_content || null
    );

    console.log('✅ Timeline created - id:', result.lastInsertRowid);

    res.status(201).json({
      id: result.lastInsertRowid,
      user_id: user.userId,
      age,
      year,
      stage: stage || 'turning_points',
      event_title,
      event_description,
      edited_content: edited_content || null,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/timeline/:id - 特定の timeline 取得（認証必須）
// ============================================
router.get('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const stmt = db.prepare('SELECT * FROM timeline WHERE id = ? AND user_id = ?');
    const timeline = stmt.get(id, user.userId);

    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    console.log('✅ Timeline retrieved - id:', id);
    res.json(timeline);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUT /api/timeline/:id - timeline 更新（認証必須）
// ============================================
router.put('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const { age, year, stage, event_title, event_description, edited_content } = req.body;

    // 本人確認
    const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(id) as any;
    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    if (timeline.user_id !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare(
      `UPDATE timeline
       SET age = COALESCE(?, age),
           year = COALESCE(?, year),
           stage = COALESCE(?, stage),
           event_title = COALESCE(?, event_title),
           event_description = COALESCE(?, event_description),
           edited_content = COALESCE(?, edited_content)
       WHERE id = ?`
    );

    stmt.run(
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      stage || null,
      event_title || null,
      event_description || null,
      edited_content || null,
      id
    );

    const updatedTimeline = db.prepare('SELECT * FROM timeline WHERE id = ?').get(id);

    console.log('✅ Timeline updated - id:', id);
    res.json({ message: 'Timeline updated successfully', data: updatedTimeline });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE /api/timeline/:id - timeline 削除（認証必須）
// ============================================
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // 本人確認
    const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(id) as any;
    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    if (timeline.user_id !== user.userId) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare('DELETE FROM timeline WHERE id = ?');
    stmt.run(id);

    console.log('✅ Timeline deleted - id:', id);
    res.json({ message: 'Timeline deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;