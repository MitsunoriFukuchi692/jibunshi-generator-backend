// 📁 server/src/routes/interview-session.ts
// interview-session のセッション保存・復元を管理するエンドポイント
import { Router } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';
const router = Router();
// ✅ 認証チェック（utils/auth の verifyToken を使用）
const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized: No token provided',
            message: 'Authorization header required'
        });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            error: 'Unauthorized: Invalid token',
            message: 'Token verification failed'
        });
    }
    // userId を request に設定
    req.userId = decoded.userId;
    req.token = token;
    next();
};
// ✅ セッション保存エンドポイント
router.post('/save', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { currentQuestionIndex, conversation, answersWithPhotos, timestamp } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'user_id is required' });
        }
        const db = getDb();
        // interview_session テーブルがあるか確認
        db.run(`
      CREATE TABLE IF NOT EXISTS interview_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_question_index INTEGER,
        conversation TEXT,
        answers_with_photos TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // セッションを保存（UPDATE or INSERT）
        const statement = db.prepare(`
      INSERT INTO interview_session 
      (user_id, current_question_index, conversation, answers_with_photos, timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        current_question_index = excluded.current_question_index,
        conversation = excluded.conversation,
        answers_with_photos = excluded.answers_with_photos,
        timestamp = excluded.timestamp,
        updated_at = CURRENT_TIMESTAMP
    `);
        statement.run(userId, currentQuestionIndex, JSON.stringify(conversation), JSON.stringify(answersWithPhotos), timestamp);
        console.log(`✅ セッション保存完了: user_id=${userId}, question_index=${currentQuestionIndex}`);
        res.json({
            success: true,
            message: 'Session saved successfully',
            data: {
                user_id: userId,
                currentQuestionIndex,
                answersCount: answersWithPhotos?.length || 0
            }
        });
    }
    catch (error) {
        console.error('❌ セッション保存エラー:', error);
        res.status(500).json({
            error: 'Failed to save session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ セッション復元エンドポイント
router.get('/load', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'user_id not found in token' });
        }
        const db = getDb();
        // テーブルがあるか確認
        db.run(`
      CREATE TABLE IF NOT EXISTS interview_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_question_index INTEGER,
        conversation TEXT,
        answers_with_photos TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        const statement = db.prepare(`
      SELECT 
        current_question_index as currentQuestionIndex,
        conversation,
        answers_with_photos as answersWithPhotos,
        timestamp
      FROM interview_session
      WHERE user_id = ?
    `);
        const session = statement.get(userId);
        if (!session) {
            console.log(`ℹ️ セッションなし: user_id=${userId}`);
            return res.status(404).json({ error: 'Session not found' });
        }
        // JSON文字列をパース
        try {
            const parsedSession = {
                currentQuestionIndex: session.currentQuestionIndex,
                conversation: JSON.parse(session.conversation),
                answersWithPhotos: JSON.parse(session.answersWithPhotos),
                timestamp: session.timestamp
            };
            console.log(`✅ セッション復元完了: user_id=${userId}, question_index=${parsedSession.currentQuestionIndex}`);
            res.json(parsedSession);
        }
        catch (parseError) {
            console.error('❌ JSONパースエラー:', parseError);
            return res.status(500).json({
                error: 'Failed to parse session data',
                details: parseError instanceof Error ? parseError.message : 'Unknown error'
            });
        }
    }
    catch (error) {
        console.error('❌ セッション復元エラー:', error);
        res.status(500).json({
            error: 'Failed to load session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ セッション削除エンドポイント
router.delete('/', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'user_id not found in token' });
        }
        const db = getDb();
        // テーブルがあるか確認
        db.run(`
      CREATE TABLE IF NOT EXISTS interview_session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_question_index INTEGER,
        conversation TEXT,
        answers_with_photos TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        const statement = db.prepare(`DELETE FROM interview_session WHERE user_id = ?`);
        const result = statement.run(userId);
        console.log(`✅ セッション削除完了: user_id=${userId}`);
        res.json({
            success: true,
            message: 'Session deleted successfully',
            deletedRows: result.changes || 0
        });
    }
    catch (error) {
        console.error('❌ セッション削除エラー:', error);
        res.status(500).json({
            error: 'Failed to delete session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
export default router;
//# sourceMappingURL=interview-session.js.map