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
// POST /api/interview/save - インタビュー回答を保存
// ============================================
router.post('/save', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();
    const { age, answersWithPhotos } = req.body;

    console.log('💾 [Save] Request received');
    console.log('👤 user_id:', userId);
    console.log('📊 answersWithPhotos type:', Array.isArray(answersWithPhotos) ? 'Array' : 'Not Array');
    console.log('📊 answersWithPhotos count:', answersWithPhotos?.length || 0);

    // ユーザー情報取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    console.log('👤 User found:', userRecord?.name);

    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // 📝 会話ログを保存（オプション - テーブルがあれば保存）
    try {
      const logStmt = db.prepare(`
        INSERT INTO conversation_logs (user_id, stage, conversation_data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `);

      const conversationData = JSON.stringify({
        answersWithPhotos: answersWithPhotos || [],
        age: age || null
      });

      const result = logStmt.run(userId, 'interview', conversationData);
      console.log('✅ Conversation log saved - logId:', result.lastInsertRowid);
    } catch (logError: any) {
      // テーブルがない場合はログして続行（致命的ではない）
      console.warn('⚠️ Conversation log save skipped (table may not exist):', logError.message);
    }

    // ✅ インタビュー保存完了
    console.log('✅ Interview save completed successfully');
    res.json({
      success: true,
      message: 'Interview answers saved successfully. Ready for AI generation.',
      userId: userId
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/interview/save:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to save interview',
      details: error.message
    });
  }
});

// ============================================
// GET /api/interview/questions - インタビュー質問一覧取得
// ============================================
router.get('/questions', (req: Request, res: Response) => {
  try {
    const INTERVIEW_QUESTIONS = [
      { id: 1, question: 'お名前を教えてください。' },
      { id: 2, question: 'おいくつですか？' },
      { id: 3, question: '今、どこにお住まいですか？' },
      { id: 4, question: 'ご家族について教えてください。' },
      { id: 5, question: '子どもの頃の思い出を教えてください。' },
      { id: 6, question: '学生時代はどのように過ごしましたか？' },
      { id: 7, question: 'どのような仕事をされていましたか？' },
      { id: 8, question: 'これまでの人生で最も大切な出来事は何ですか？' },
      { id: 9, question: 'どのような趣味や好きなことがありますか？' },
      { id: 10, question: '旅行の思い出や行きたい場所はありますか？' },
      { id: 11, question: 'これまでの人生で学んだ大切なことは何ですか？' },
      { id: 12, question: '人生で後悔していることはありますか？' },
      { id: 13, question: '誇りに思っていることは何ですか？' },
      { id: 14, question: 'ご友人との関係について教えてください。' },
      { id: 15, question: '人生で最も幸せを感じた時期はいつですか？' },
      { id: 16, question: '今、大切にしていることは何ですか？' },
      { id: 17, question: '将来やってみたいことはありますか？' },
      { id: 18, question: 'ご家族や友人に伝えたいことはありますか？' },
      { id: 19, question: '最後に、自分の人生について一言お願いします。' }
    ];

    console.log('📖 Question list request - total:', INTERVIEW_QUESTIONS.length);
    res.json(INTERVIEW_QUESTIONS);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/interview-session/save - インタビュー途中の自動保存
// ============================================
router.post('/session/save', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();
    const { currentQuestionIndex, conversation, answersWithPhotos, timestamp } = req.body;

    console.log('💾 [Interview Session Save] Request received');
    console.log('👤 user_id:', userId);
    console.log('📝 currentQuestionIndex:', currentQuestionIndex);
    console.log('💬 conversation count:', conversation?.length || 0);
    console.log('📊 answersWithPhotos count:', answersWithPhotos?.length || 0);

    // ユーザー情報取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // インタビューセッションを保存（conversation_logs テーブルに保存）
    try {
      const logStmt = db.prepare(`
        INSERT INTO conversation_logs (user_id, stage, conversation_data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `);

      const sessionData = JSON.stringify({
        currentQuestionIndex,
        conversation: conversation || [],
        answersWithPhotos: answersWithPhotos || [],
        timestamp: timestamp || Date.now()
      });

      const result = logStmt.run(userId, 'interview_session', sessionData);
      console.log('✅ Interview session saved - logId:', result.lastInsertRowid);
    } catch (saveError: any) {
      console.error('❌ Error saving interview session:', saveError.message);
      return res.status(500).json({
        error: 'Failed to save session',
        details: saveError.message
      });
    }

    // ✅ セッション保存完了
    console.log('✅ Interview session save completed successfully');
    res.json({
      success: true,
      message: 'Interview session saved successfully',
      userId: userId,
      savedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/interview-session/save:', error);
    console.error('❌ Error details:', error.message);
    res.status(500).json({
      error: 'Failed to save interview session',
      details: error.message
    });
  }
});

// ============================================
// POST /api/interview-session/update-answers - 修正された回答を保存
// ============================================
router.post('/session/update-answers', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();
    const { answersWithPhotos } = req.body;

    console.log('📝 [Update Answers] Request received');
    console.log('👤 user_id:', userId);
    console.log('📊 answersWithPhotos count:', answersWithPhotos?.length || 0);

    // ユーザー情報取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // 修正された回答をデータベースに保存
    try {
      const logStmt = db.prepare(`
        INSERT INTO conversation_logs (user_id, stage, conversation_data, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `);

      const updatedData = JSON.stringify({
        answersWithPhotos: answersWithPhotos || [],
        updatedAt: Date.now()
      });

      const result = logStmt.run(userId, 'answers_updated', updatedData);
      console.log('✅ Answers updated - logId:', result.lastInsertRowid);
    } catch (saveError: any) {
      console.error('❌ Error updating answers:', saveError.message);
      return res.status(500).json({
        error: 'Failed to update answers',
        details: saveError.message
      });
    }

    // ✅ 回答更新完了
    console.log('✅ Answers update completed successfully');
    res.json({
      success: true,
      message: 'Answers updated successfully',
      userId: userId,
      updatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/interview-session/update-answers:', error);
    console.error('❌ Error details:', error.message);
    res.status(500).json({
      error: 'Failed to update answers',
      details: error.message
    });
  }
});

// ============================================
// GET /api/interview-session/load - セッションを読み込む
// ============================================
router.get('/session/load', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();

    console.log('📖 [Load Session] Request received - userId:', userId);

    // 最新のインタビューセッションを取得
    const logRecord = db.prepare(`
      SELECT * FROM conversation_logs
      WHERE user_id = ? AND stage = 'interview_session'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId) as any;

    if (!logRecord) {
      console.log('ℹ️ No session found for user:', userId);
      return res.json({ message: 'No session found' });
    }

    let sessionData = {};
    try {
      sessionData = JSON.parse(logRecord.conversation_data);
      console.log('✅ Session loaded:', {
        currentQuestionIndex: (sessionData as any).currentQuestionIndex,
        conversationCount: (sessionData as any).conversation?.length || 0,
        answersCount: (sessionData as any).answersWithPhotos?.length || 0
      });

    } catch (parseError) {
      console.error('❌ Error parsing session data:', parseError);
      return res.status(500).json({ error: 'Failed to parse session data' });
    }

    res.json(sessionData);

  } catch (error: any) {
    console.error('❌ Error in GET /api/interview-session/load:', error);
    res.status(500).json({
      error: 'Failed to load session',
      details: error.message
    });
  }
});

// ============================================
// DELETE /api/interview-session - セッションを削除
// ============================================
router.delete('/session', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();

    console.log('🗑️ [Delete Session] Request received - userId:', userId);

    // インタビューセッションのログレコードを削除
    const deleteStmt = db.prepare(`
      DELETE FROM conversation_logs
      WHERE user_id = ? AND stage = 'interview_session'
    `);

    const result = deleteStmt.run(userId);
    console.log('✅ Session deleted - rows affected:', result.changes);

    res.json({
      success: true,
      message: 'Session deleted successfully',
      rowsDeleted: result.changes
    });

  } catch (error: any) {
    console.error('❌ Error in DELETE /api/interview-session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      details: error.message
    });
  }
});

export default router;