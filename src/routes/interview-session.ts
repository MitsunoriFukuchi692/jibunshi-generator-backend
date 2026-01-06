import express, { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

// ✅ 認証ミドルウェア
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

/**
 * POST /api/interview-session/save
 * インタビューセッションをサーバーに保存
 */
router.post('/save', authenticate, (req: Request, res: Response) => {
  try {
    const { user_id, currentQuestionIndex, conversation, answersWithPhotos } = req.body;
    const userId = (req as any).user.userId;

    // ユーザーID検証
    if (!user_id || user_id !== userId) {
      return res.status(401).json({ error: 'Unauthorized - user_id mismatch' });
    }

    // 入力値検証
    if (currentQuestionIndex === undefined || !Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDb();

    // ✅ better-sqlite3 は同期的なので await は不要
    // UPSERT: 新規作成 または 更新
    const stmt = db.prepare(`
      INSERT INTO interview_sessions (user_id, current_question_index, conversation, answers_with_photos, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) 
      DO UPDATE SET 
        current_question_index = EXCLUDED.current_question_index,
        conversation = EXCLUDED.conversation,
        answers_with_photos = EXCLUDED.answers_with_photos,
        updated_at = CURRENT_TIMESTAMP
    `);

    const result = stmt.run(
      user_id,
      currentQuestionIndex,
      JSON.stringify(conversation),
      JSON.stringify(answersWithPhotos || [])
    );

    console.log('✅ Interview session saved:', {
      userId: user_id,
      questionIndex: currentQuestionIndex,
      conversationLength: conversation.length,
      answerCount: (answersWithPhotos || []).length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Session saved successfully',
      data: { changes: result.changes }
    });
  } catch (error) {
    console.error('❌ Error saving interview session:', error);
    res.status(500).json({
      error: 'Failed to save interview session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/interview-session/load
 * サーバーに保存されたセッションを復元
 */
router.get('/load', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const db = getDb();

    // ✅ better-sqlite3: prepare().get() で単一行取得
    const stmt = db.prepare(`
      SELECT 
        id,
        user_id,
        current_question_index as currentQuestionIndex,
        conversation,
        answers_with_photos as answersWithPhotos,
        created_at as createdAt,
        updated_at as updatedAt
      FROM interview_sessions
      WHERE user_id = ?
    `);

    const result = stmt.get(userId);

    if (!result) {
      return res.status(404).json({
        error: 'No saved session found',
        data: null
      });
    }

    // JSON 文字列をパースする
    const sessionData = {
      currentQuestionIndex: result.currentQuestionIndex,
      conversation: typeof result.conversation === 'string'
        ? JSON.parse(result.conversation)
        : result.conversation,
      answersWithPhotos: typeof result.answersWithPhotos === 'string'
        ? JSON.parse(result.answersWithPhotos)
        : result.answersWithPhotos,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt
    };

    console.log('✅ Interview session loaded:', {
      userId,
      questionIndex: sessionData.currentQuestionIndex,
      conversationLength: sessionData.conversation.length,
      answerCount: sessionData.answersWithPhotos.length,
      savedAt: result.updatedAt
    });

    res.json(sessionData);
  } catch (error) {
    console.error('❌ Error loading interview session:', error);
    res.status(500).json({
      error: 'Failed to load interview session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/interview-session
 * インタビューセッションを削除（完了時に使用）
 */
router.delete('/', authenticate, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const db = getDb();

    // ✅ better-sqlite3: prepare().run()
    const stmt = db.prepare('DELETE FROM interview_sessions WHERE user_id = ?');
    const result = stmt.run(userId);

    console.log('✅ Interview session deleted for user:', userId);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting interview session:', error);
    res.status(500).json({
      error: 'Failed to delete interview session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;