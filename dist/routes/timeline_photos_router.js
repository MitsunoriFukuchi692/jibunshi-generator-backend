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
// POST /api/timeline/:timelineId/photos - 写真をタイムラインに紐付け
// ============================================
router.post('/:timelineId/photos', authenticate, (req, res) => {
    try {
        const user = req.user;
        const { timelineId } = req.params;
        const { photoIds } = req.body; // photoIds は配列: [1, 2, 3]
        const db = getDb();
        console.log('🔗 Timeline photo linking - timelineId:', timelineId, 'photoIds:', photoIds);
        // タイムラインの所有者確認
        const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(timelineId);
        if (!timeline) {
            return res.status(404).json({ error: 'Timeline not found' });
        }
        if (timeline.user_id !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        // 既存の紐付けを削除
        db.prepare('DELETE FROM timeline_photos WHERE timeline_id = ?').run(timelineId);
        console.log('🗑️ Existing timeline_photos deleted for timelineId:', timelineId);
        // 新しい紐付けを追加
        if (Array.isArray(photoIds) && photoIds.length > 0) {
            const insertStmt = db.prepare(`
        INSERT INTO timeline_photos (timeline_id, photo_id, created_at)
        VALUES (?, ?, datetime('now'))
      `);
            let insertedCount = 0;
            for (const photoId of photoIds) {
                // 写真の所有者確認
                const photo = db.prepare('SELECT user_id FROM photos WHERE id = ?').get(photoId);
                if (!photo || photo.user_id !== user.userId) {
                    console.warn('⚠️ Photo not found or access denied - photoId:', photoId);
                    continue;
                }
                insertStmt.run(timelineId, photoId);
                insertedCount++;
            }
            console.log('✅ Inserted', insertedCount, 'timeline_photos');
        }
        res.json({
            success: true,
            message: 'Photos linked to timeline successfully',
            timelineId,
            linkedPhotoCount: photoIds.length
        });
    }
    catch (error) {
        console.error('❌ Error linking photos:', error);
        res.status(500).json({
            error: 'Failed to link photos to timeline',
            details: error.message
        });
    }
});
// ============================================
// GET /api/timeline/:timelineId/photos - タイムラインに紐付いた写真を取得
// ============================================
router.get('/:timelineId/photos', authenticate, (req, res) => {
    try {
        const user = req.user;
        const { timelineId } = req.params;
        const db = getDb();
        console.log('📸 Getting timeline photos - timelineId:', timelineId);
        // タイムラインの所有者確認
        const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(timelineId);
        if (!timeline) {
            return res.status(404).json({ error: 'Timeline not found' });
        }
        if (timeline.user_id !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        // タイムラインに紐付いた写真を取得
        const photos = db.prepare(`
      SELECT 
        p.id,
        p.filename,
        p.file_path,
        p.description,
        p.uploaded_at,
        tp.created_at as linked_at
      FROM timeline_photos tp
      JOIN photos p ON tp.photo_id = p.id
      WHERE tp.timeline_id = ?
      ORDER BY tp.created_at ASC
    `).all(timelineId);
        console.log('✅ Found', photos.length, 'photos for timeline');
        res.json(photos);
    }
    catch (error) {
        console.error('❌ Error getting timeline photos:', error);
        res.status(500).json({
            error: 'Failed to get timeline photos',
            details: error.message
        });
    }
});
// ============================================
// DELETE /api/timeline/:timelineId/photos/:photoId - 写真の紐付けを削除
// ============================================
router.delete('/:timelineId/photos/:photoId', authenticate, (req, res) => {
    try {
        const user = req.user;
        const { timelineId, photoId } = req.params;
        const db = getDb();
        console.log('🗑️ Deleting timeline photo link - timelineId:', timelineId, 'photoId:', photoId);
        // タイムラインの所有者確認
        const timeline = db.prepare('SELECT user_id FROM timeline WHERE id = ?').get(timelineId);
        if (!timeline) {
            return res.status(404).json({ error: 'Timeline not found' });
        }
        if (timeline.user_id !== user.userId) {
            return res.status(403).json({ error: 'アクセス権限がありません。' });
        }
        // 紐付けを削除
        const stmt = db.prepare('DELETE FROM timeline_photos WHERE timeline_id = ? AND photo_id = ?');
        const result = stmt.run(timelineId, photoId);
        console.log('✅ Photo link deleted');
        res.json({
            success: true,
            message: 'Photo link removed successfully'
        });
    }
    catch (error) {
        console.error('❌ Error deleting photo link:', error);
        res.status(500).json({
            error: 'Failed to delete photo link',
            details: error.message
        });
    }
});
export default router;
//# sourceMappingURL=timeline_photos_router.js.map