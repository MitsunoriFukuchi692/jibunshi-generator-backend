// 📁 server/src/routes/interview-session.ts
// interview-session のセッション保存・復元を管理するエンドポイント（改善版）
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
// ✅ テーブル初期化関数
const ensureTablesExist = (db) => {
    try {
        db.exec(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_question_index INTEGER DEFAULT 0,
        conversation TEXT DEFAULT '[]',
        answers_with_photos TEXT DEFAULT '[]',
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
        // ✅ インデックス作成（高速化）
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
    `);
        console.log('✅ interview_sessions テーブル確認完了');
    }
    catch (error) {
        console.error('❌ テーブル初期化エラー:', error);
        throw error;
    }
};
// ✅ セッション保存エンドポイント（改善版）
router.post('/save', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { currentQuestionIndex, conversation, answersWithPhotos, timestamp } = req.body;
        if (!userId) {
            console.error('❌ user_id なし');
            return res.status(400).json({ error: 'user_id is required' });
        }
        const db = getDb();
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        // ✅ 詳細なログ出力
        console.log('💾 [Save] セッション保存開始:', {
            userId,
            currentQuestionIndex,
            conversationLength: conversation?.length || 0,
            answersCount: answersWithPhotos?.length || 0,
            timestamp: new Date(timestamp).toISOString()
        });
        // ✅ 保存する数据の検証
        if (!Array.isArray(conversation)) {
            console.error('❌ conversation は配列である必要があります:', typeof conversation);
            return res.status(400).json({ error: 'conversation must be an array' });
        }
        if (!Array.isArray(answersWithPhotos)) {
            console.error('❌ answersWithPhotos は配列である必要があります:', typeof answersWithPhotos);
            return res.status(400).json({ error: 'answersWithPhotos must be an array' });
        }
        // ✅ セッションを保存（UPDATE or INSERT）
        const statement = db.prepare(`
      INSERT INTO interview_sessions 
      (user_id, current_question_index, conversation, answers_with_photos, timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        current_question_index = excluded.current_question_index,
        conversation = excluded.conversation,
        answers_with_photos = excluded.answers_with_photos,
        timestamp = excluded.timestamp,
        updated_at = CURRENT_TIMESTAMP
    `);
        const conversationJson = JSON.stringify(conversation);
        const answersJson = JSON.stringify(answersWithPhotos);
        const result = statement.run(userId, currentQuestionIndex, conversationJson, answersJson, timestamp);
        // ✅ 保存結果の検証
        console.log('✅ [Save] セッション保存完了:', {
            userId,
            rowsChanged: result.changes || 0,
            currentQuestionIndex,
            answersCount: answersWithPhotos.length,
            timestamp: new Date(timestamp).toISOString()
        });
        // ✅ 保存したデータを再度読み込んで確認
        const verifyStmt = db.prepare(`
      SELECT user_id, current_question_index, conversation, answers_with_photos, updated_at
      FROM interview_sessions
      WHERE user_id = ?
    `);
        const saved = verifyStmt.get(userId);
        if (saved) {
            console.log('✅ [Verify] 保存データ確認成功:', {
                userId: saved.user_id,
                currentQuestionIndex: saved.current_question_index,
                conversationLength: JSON.parse(saved.conversation).length,
                answersCount: JSON.parse(saved.answers_with_photos).length,
                updatedAt: saved.updated_at
            });
        }
        else {
            console.error('❌ [Verify] 保存したデータが見つかりません');
        }
        res.json({
            success: true,
            message: 'Session saved successfully',
            data: {
                user_id: userId,
                currentQuestionIndex,
                answersCount: answersWithPhotos.length,
                savedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('❌ [Error] セッション保存エラー:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack'
        });
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
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        console.log('📖 [Load] セッション復元開始:', { userId });
        const statement = db.prepare(`
      SELECT 
        current_question_index as currentQuestionIndex,
        conversation,
        answers_with_photos as answersWithPhotos,
        timestamp,
        updated_at as updatedAt
      FROM interview_sessions
      WHERE user_id = ?
    `);
        const session = statement.get(userId);
        if (!session) {
            console.log('ℹ️ [Load] セッションなし:', { userId });
            return res.status(404).json({ error: 'Session not found' });
        }
        // JSON文字列をパース
        try {
            const parsedSession = {
                currentQuestionIndex: session.currentQuestionIndex,
                conversation: JSON.parse(session.conversation),
                answersWithPhotos: JSON.parse(session.answersWithPhotos),
                timestamp: session.timestamp,
                updatedAt: session.updatedAt
            };
            // ✅ データ整合性チェック
            console.log('✅ [Load] セッション復元成功:', {
                userId,
                currentQuestionIndex: parsedSession.currentQuestionIndex,
                conversationLength: parsedSession.conversation.length,
                answersCount: parsedSession.answersWithPhotos.length,
                updatedAt: parsedSession.updatedAt,
                age: Math.floor((Date.now() - session.timestamp) / 1000) + 's'
            });
            res.json(parsedSession);
        }
        catch (parseError) {
            console.error('❌ [Parse] JSONパースエラー:', parseError);
            return res.status(500).json({
                error: 'Failed to parse session data',
                details: parseError instanceof Error ? parseError.message : 'Unknown error'
            });
        }
    }
    catch (error) {
        console.error('❌ [Error] セッション復元エラー:', error);
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
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        const statement = db.prepare(`DELETE FROM interview_sessions WHERE user_id = ?`);
        const result = statement.run(userId);
        console.log('✅ [Delete] セッション削除完了:', {
            userId,
            deletedRows: result.changes || 0
        });
        res.json({
            success: true,
            message: 'Session deleted successfully',
            deletedRows: result.changes || 0
        });
    }
    catch (error) {
        console.error('❌ [Error] セッション削除エラー:', error);
        res.status(500).json({
            error: 'Failed to delete session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ 修正された回答を更新（新エンドポイント）
router.post('/update-answers', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { answersWithPhotos } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'user_id is required' });
        }
        if (!Array.isArray(answersWithPhotos)) {
            return res.status(400).json({ error: 'answersWithPhotos must be an array' });
        }
        const db = getDb();
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        console.log('💾 [UpdateAnswers] 回答更新開始:', {
            userId,
            answersCount: answersWithPhotos.length,
            timestamp: new Date().toISOString()
        });
        // ✅ セッションを更新
        const statement = db.prepare(`
      UPDATE interview_sessions
      SET answers_with_photos = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);
        const answersJson = JSON.stringify(answersWithPhotos);
        const result = statement.run(answersJson, userId);
        // ✅ 更新結果の検証
        console.log('✅ [UpdateAnswers] 回答更新完了:', {
            userId,
            rowsChanged: result.changes || 0,
            answersCount: answersWithPhotos.length
        });
        // ✅ 更新したデータを再度読み込んで確認
        const verifyStmt = db.prepare(`
      SELECT answers_with_photos, updated_at
      FROM interview_sessions
      WHERE user_id = ?
    `);
        const updated = verifyStmt.get(userId);
        if (updated) {
            const savedAnswers = JSON.parse(updated.answers_with_photos);
            console.log('✅ [Verify] 更新データ確認成功:', {
                userId,
                answersCount: savedAnswers.length,
                updatedAt: updated.updated_at
            });
        }
        res.json({
            success: true,
            message: 'Answers updated successfully',
            user_id: userId,
            updatedAt: new Date().toISOString(),
            answersCount: answersWithPhotos.length
        });
    }
    catch (error) {
        console.error('❌ [Error] 回答更新エラー:', error);
        res.status(500).json({
            error: 'Failed to update answers',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ セッション情報取得（デバッグ用）
router.get('/info', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'user_id not found in token' });
        }
        const db = getDb();
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        const statement = db.prepare(`
      SELECT 
        id,
        user_id,
        current_question_index,
        length(conversation) as conversation_size,
        length(answers_with_photos) as answers_size,
        timestamp,
        created_at,
        updated_at
      FROM interview_sessions
      WHERE user_id = ?
    `);
        const session = statement.get(userId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json({
            success: true,
            data: {
                sessionId: session.id,
                userId: session.user_id,
                currentQuestionIndex: session.current_question_index,
                conversationSize: session.conversation_size + ' bytes',
                answersSize: session.answers_size + ' bytes',
                timestamp: new Date(session.timestamp).toISOString(),
                createdAt: session.created_at,
                updatedAt: session.updated_at,
                age: Math.floor((Date.now() - session.timestamp) / 1000) + 's'
            }
        });
    }
    catch (error) {
        console.error('❌ [Error] セッション情報取得エラー:', error);
        res.status(500).json({
            error: 'Failed to get session info',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
export default router;
//# sourceMappingURL=interview-session.js.map