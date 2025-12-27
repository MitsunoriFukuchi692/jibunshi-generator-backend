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

  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '無効または期限切れのトークンです' });
  }

  (req as any).user = decoded;
  next();
};

// ============================================
// POST /api/interviews - インタビューデータを一括保存
// ============================================
router.post('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { interviews } = req.body;

    console.log('💾 Interviews save request:', {
      userId: user.userId,
      count: interviews?.length || 0
    });

    if (!interviews || !Array.isArray(interviews)) {
      return res.status(400).json({ error: 'interviews array is required' });
    }

    if (interviews.length === 0) {
      return res.status(400).json({ error: 'interviews array cannot be empty' });
    }

    const db = getDb();
    let saveCount = 0;

    try {
      const insertStmt = db.prepare(`
        INSERT INTO interviews (user_id, question, answer_text, duration_seconds, is_processed, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `);

      for (const interview of interviews) {
        if (!interview.question || interview.answer_text === undefined) {
          console.warn('⚠️ Skipping invalid interview record');
          continue;
        }

        insertStmt.run(
          user.userId,
          interview.question,
          interview.answer_text,
          0  // duration_seconds
        );
        saveCount++;
      }

      console.log('✅ Interviews saved:', saveCount, 'records');

      res.status(201).json({
        success: true,
        data: {
          count: saveCount,
          userId: user.userId
        }
      });

    } catch (dbError: any) {
      console.error('❌ Database error:', dbError);
      throw dbError;
    }

  } catch (error: any) {
    console.error('❌ Error saving interviews:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/interviews - ユーザーのインタビューデータ取得
// ============================================
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const db = getDb();

    const interviews = db.prepare(`
      SELECT id, question, answer_text, duration_seconds, created_at
      FROM interviews
      WHERE user_id = ?
      ORDER BY id ASC
    `).all(user.userId) as any[];

    console.log('✅ Fetched', interviews.length, 'interviews for user', user.userId);

    res.json({
      success: true,
      data: interviews
    });

  } catch (error: any) {
    console.error('❌ Error fetching interviews:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE /api/interviews - インタビューデータを削除
// ============================================
router.delete('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const db = getDb();

    const deleteStmt = db.prepare('DELETE FROM interviews WHERE user_id = ?');
    const result = deleteStmt.run(user.userId);

    console.log('✅ Deleted', result.changes, 'interview records');

    res.json({
      success: true,
      data: {
        deletedCount: result.changes
      }
    });

  } catch (error: any) {
    console.error('❌ Error deleting interviews:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
