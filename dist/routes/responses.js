import { Router } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';
const router = Router();
// ============================================
// 認証ミドルウェア
// ============================================
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    if (!token) {
        return res.status(401).json({ error: '認証が必要です。トークンが見つかりません。' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: '無効または期限切れのトークンです。' });
    }
    req.user = decoded;
    next();
};
// ============================================
// GET /api/responses - ユーザーの回答一覧取得（認証必須）
// ============================================
router.get('/', authenticate, (req, res) => {
    try {
        const user = req.user;
        const { userId, stage } = req.query;
        const db = getDb();
        // 指定されたuserIdが自分のIDと一致するか確認
        if (userId && parseInt(userId) !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        let query = 'SELECT * FROM responses WHERE user_id = ?';
        const params = [user.userId];
        if (stage) {
            query += ' AND stage = ?';
            params.push(stage);
        }
        query += ' ORDER BY created_at DESC';
        const stmt = db.prepare(query);
        const responses = stmt.all(...params);
        res.json(responses);
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: '回答一覧の取得に失敗しました。' });
    }
});
// ============================================
// POST /api/responses - 回答保存（認証必須）
// ============================================
router.post('/', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        const { userId, questionId, stage, questionText, responseText, isVoice, photoId, } = req.body;
        // バリデーション
        if (!stage || !questionText || !responseText) {
            return res.status(400).json({
                error: 'stage, questionText, responseText は必須です。',
            });
        }
        // 本人確認
        if (!userId || parseInt(userId) !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        const stmt = db.prepare(`INSERT INTO responses (user_id, question_id, stage, question_text, response_text, is_voice, photo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`);
        const result = stmt.run(userId, questionId || null, stage, questionText, responseText, isVoice ? 1 : 0, photoId || null);
        res.status(201).json({
            id: result.lastInsertRowid,
            userId,
            questionId,
            stage,
            questionText,
            responseText,
            isVoice,
            photoId,
            created_at: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: '回答の保存に失敗しました。' });
    }
});
// ============================================
// GET /api/responses/:id - 特定の回答取得（認証必須、本人のみ）
// ============================================
router.get('/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM responses WHERE id = ?');
        const response = stmt.get(id);
        if (!response) {
            return res.status(404).json({ error: '回答が見つかりません。' });
        }
        // 本人確認
        if (response.user_id !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        res.json(response);
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: '回答の取得に失敗しました。' });
    }
});
// ============================================
// DELETE /api/responses/:id - 回答削除（認証必須、本人のみ）
// ============================================
router.delete('/:id', authenticate, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const db = getDb();
        const response = db.prepare('SELECT * FROM responses WHERE id = ?').get(id);
        if (!response) {
            return res.status(404).json({ error: '回答が見つかりません。' });
        }
        // 本人確認
        if (response.user_id !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        const stmt = db.prepare('DELETE FROM responses WHERE id = ?');
        stmt.run(id);
        res.json({ message: '回答が削除されました。' });
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: '回答の削除に失敗しました。' });
    }
});
export default router;
//# sourceMappingURL=responses.js.map