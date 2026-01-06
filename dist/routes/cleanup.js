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
        console.error('❌ No token found');
        return res.status(401).json({ error: '認証が必要です' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        console.error('❌ Token verification failed');
        return res.status(401).json({ error: '無効または期限切れのトークンです' });
    }
    console.log('✅ Token verified - userId:', decoded.userId);
    req.user = decoded;
    next();
};
// ============================================
// DELETE /api/cleanup/old-data - 過去データを削除
// ============================================
router.delete('/old-data', authenticate, (req, res) => {
    try {
        const user = req.user;
        const { user_id } = req.body;
        const db = getDb();
        // リクエストのuser_idがトークンのuserIdと一致するか確認
        if (user_id !== user.userId) {
            console.error('❌ User ID mismatch - requested:', user_id, 'token:', user.userId);
            return res.status(403).json({ error: 'アクセス権限がありません' });
        }
        console.log('🗑️ Old data cleanup request - user_id:', user_id);
        // ✅ ステップ1: biography_photos を削除
        const biographyPhotosDeleteStmt = db.prepare(`
      DELETE FROM biography_photos 
      WHERE biography_id IN (
        SELECT id FROM biography WHERE user_id = ?
      )
    `);
        const biographyPhotosDeleted = biographyPhotosDeleteStmt.run(user_id).changes;
        console.log('  📸 biography_photos削除:', biographyPhotosDeleted, '件');
        // ✅ ステップ2: timeline_photos を削除
        const timelinePhotosDeleteStmt = db.prepare(`
      DELETE FROM timeline_photos 
      WHERE timeline_id IN (
        SELECT id FROM timeline WHERE user_id = ?
      )
    `);
        const timelinePhotosDeleted = timelinePhotosDeleteStmt.run(user_id).changes;
        console.log('  📸 timeline_photos削除:', timelinePhotosDeleted, '件');
        // ✅ ステップ3: timeline を削除
        const timelineDeleteStmt = db.prepare('DELETE FROM timeline WHERE user_id = ?');
        const timelineDeleted = timelineDeleteStmt.run(user_id).changes;
        console.log('  📝 timeline削除:', timelineDeleted, '件');
        // ✅ ステップ4: biography を削除
        const biographyDeleteStmt = db.prepare('DELETE FROM biography WHERE user_id = ?');
        const biographyDeleted = biographyDeleteStmt.run(user_id).changes;
        console.log('  📚 biography削除:', biographyDeleted, '件');
        // ✅ ステップ5: timeline_metadata を削除
        const timelineMetadataDeleteStmt = db.prepare('DELETE FROM timeline_metadata WHERE user_id = ?');
        const timelineMetadataDeleted = timelineMetadataDeleteStmt.run(user_id).changes;
        console.log('  📊 timeline_metadata削除:', timelineMetadataDeleted, '件');
        console.log('✅ Old data cleanup completed', {
            timelineDeleted,
            biographyDeleted,
            timelineMetadataDeleted,
            biographyPhotosDeleted,
            timelinePhotosDeleted
        });
        res.json({
            success: true,
            message: '過去データの削除が完了しました',
            timelineDeleted,
            biographyDeleted,
            timelineMetadataDeleted,
            biographyPhotosDeleted,
            timelinePhotosDeleted,
            totalDeleted: timelineDeleted + biographyDeleted + timelineMetadataDeleted
        });
    }
    catch (error) {
        console.error('❌ Error in DELETE /api/cleanup/old-data:', error);
        res.status(500).json({
            error: 'データ削除に失敗しました',
            details: error.message
        });
    }
});
export default router;
//# sourceMappingURL=cleanup.js.map