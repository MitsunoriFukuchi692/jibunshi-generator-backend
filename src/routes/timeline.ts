import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

// ============================================
// 認証ミドルウェア
// ============================================
const authenticate = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  console.log('🔐 Authentication check - Header:', authHeader);

  if (!token) {
    console.error('❌ No token found');
    return res.status(401).json({ error: '認証が必要です。トークンが見つかりません。' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    console.error('❌ Token verification failed');
    return res.status(401).json({ error: '無効または期限切れのトークンです。' });
  }

  console.log('✅ Token verified - userId:', decoded.userId);
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
    const db = getDb();

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

    console.log('✅ Timeline list:', timelines.length, 'items');
    res.json(timelines);
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
    const db = getDb();
    const { age, year, month, turning_point, stage, event_title, event_description, edited_content, answersWithPhotos } = req.body;

    console.log('💾 Timeline creation request:', {
      userId: user.userId,
      eventTitle: event_title,
      hasEditedContent: !!edited_content,
      contentLength: edited_content?.length || 0
    });

    // 必須フィールドの検証
    if (!event_title) {
      console.warn('⚠️ Missing event_title');
      return res.status(400).json({
        error: 'event_title is required',
      });
    }

    if (!event_description && !edited_content) {
      console.warn('⚠️ Missing both event_description and edited_content');
      return res.status(400).json({
        error: 'Either event_description or edited_content is required',
      });
    }

    // timeline テーブルに保存
    const stmt = db.prepare(
      `INSERT INTO timeline (user_id, age, year, month, turning_point, stage, event_title, event_description, edited_content, is_auto_generated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const result = stmt.run(
      user.userId,
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      month ? parseInt(month) : null,
      turning_point || null,
      stage || 'interview',
      event_title,
      event_description || null,
      edited_content || null,
      1  // is_auto_generated: AI生成テキスト
    );

    const timelineId = result.lastInsertRowid;
    console.log('✅ Timeline created successfully - id:', timelineId);

    // 写真データを保存（オプション）
    if (answersWithPhotos && Array.isArray(answersWithPhotos)) {
      try {
        const photoStmt = db.prepare(
          `INSERT INTO timeline_photos (timeline_id, file_path, description, created_at)
           VALUES (?, ?, ?, datetime('now'))`
        );

        let photoCount = 0;
        for (let idx = 0; idx < answersWithPhotos.length; idx++) {
          const answer = answersWithPhotos[idx];
          if (answer.photos && Array.isArray(answer.photos)) {
            for (const photo of answer.photos) {
              photoStmt.run(
                timelineId,
                photo.file_path,
                photo.description || `Photo from Q${idx + 1}`
              );
              photoCount++;
            }
          }
        }
        console.log('✅ Photos saved -', photoCount, 'photos for timeline id:', timelineId);
      } catch (photoError: any) {
        console.warn('⚠️ Photo save warning:', photoError.message);
        // 写真保存エラーは無視して続行
      }
    }

    // 保存されたデータを取得して返す
    const savedTimeline = db.prepare('SELECT * FROM timeline WHERE id = ?').get(timelineId);

    res.status(201).json({
      success: true,
      message: 'Timeline created successfully',
      data: savedTimeline
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/timeline:', error);
    res.status(500).json({ 
      error: 'Failed to create timeline',
      details: error.message 
    });
  }
});

// ============================================
// GET /api/timeline/:id - 特定の timeline 取得（認証必須）
// ============================================
router.get('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const db = getDb();

    console.log('📖 Timeline detail request - id:', id);

    const stmt = db.prepare('SELECT * FROM timeline WHERE id = ? AND user_id = ?');
    const timeline = stmt.get(id, user.userId);

    if (!timeline) {
      console.warn('⚠️ Timeline not found - id:', id);
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
    const db = getDb();
    const { age, year, month, turning_point, stage, event_title, event_description, edited_content } = req.body;

    console.log('✏️ Timeline update request - id:', id);

    // 本人確認
    const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(id) as any;
    if (!timeline) {
      console.warn('⚠️ Timeline not found - id:', id);
      return res.status(404).json({ error: 'Timeline not found' });
    }

    if (timeline.user_id !== user.userId) {
      console.error('❌ Access denied - user:', user.userId, 'timeline owner:', timeline.user_id);
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare(
      `UPDATE timeline
       SET age = COALESCE(?, age),
           year = COALESCE(?, year),
           month = COALESCE(?, month),
           turning_point = COALESCE(?, turning_point),
           stage = COALESCE(?, stage),
           event_title = COALESCE(?, event_title),
           event_description = COALESCE(?, event_description),
           edited_content = COALESCE(?, edited_content),
           updated_at = datetime('now')
       WHERE id = ?`
    );

    stmt.run(
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      month ? parseInt(month) : null,
      turning_point || null,
      stage || null,
      event_title || null,
      event_description || null,
      edited_content || null,
      id
    );

    const updatedTimeline = db.prepare('SELECT * FROM timeline WHERE id = ?').get(id);

    console.log('✅ Timeline updated successfully - id:', id);
    res.json({ 
      success: true,
      message: 'Timeline updated successfully', 
      data: updatedTimeline 
    });
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
    const db = getDb();

    console.log('🗑️ Timeline delete request - id:', id);

    // 本人確認
    const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(id) as any;
    if (!timeline) {
      console.warn('⚠️ Timeline not found - id:', id);
      return res.status(404).json({ error: 'Timeline not found' });
    }

    if (timeline.user_id !== user.userId) {
      console.error('❌ Access denied');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare('DELETE FROM timeline WHERE id = ?');
    stmt.run(id);

    console.log('✅ Timeline deleted successfully - id:', id);
    res.json({ 
      success: true,
      message: 'Timeline deleted successfully' 
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;