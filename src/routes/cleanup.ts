import { Router, Request, Response } from 'express';
import { queryRun } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

const authenticate = (req: Request, res: Response, next: Function) => {
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
  (req as any).user = decoded;
  next();
};

router.delete('/old-data', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { user_id } = req.body;

    if (user_id !== user.userId) {
      console.error('❌ User ID mismatch - requested:', user_id, 'token:', user.userId);
      return res.status(403).json({ error: 'アクセス権限がありません' });
    }

    console.log('🗑️ Old data cleanup request - user_id:', user_id);

    const biographyPhotosResult = await queryRun(
      `DELETE FROM biography_photos WHERE biography_id IN (SELECT id FROM biography WHERE user_id = ?)`,
      [user_id]
    );
    const biographyPhotosDeleted = biographyPhotosResult.rowCount || 0;
    console.log('  📸 biography_photos削除:', biographyPhotosDeleted, '件');

    const timelinePhotosResult = await queryRun(
      `DELETE FROM timeline_photos WHERE timeline_id IN (SELECT id FROM timeline WHERE user_id = ?)`,
      [user_id]
    );
    const timelinePhotosDeleted = timelinePhotosResult.rowCount || 0;
    console.log('  📸 timeline_photos削除:', timelinePhotosDeleted, '件');

    const timelineResult = await queryRun('DELETE FROM timeline WHERE user_id = ?', [user_id]);
    const timelineDeleted = timelineResult.rowCount || 0;
    console.log('  📝 timeline削除:', timelineDeleted, '件');

    const biographyResult = await queryRun('DELETE FROM biography WHERE user_id = ?', [user_id]);
    const biographyDeleted = biographyResult.rowCount || 0;
    console.log('  📚 biography削除:', biographyDeleted, '件');

    const timelineMetadataResult = await queryRun('DELETE FROM timeline_metadata WHERE user_id = ?', [user_id]);
    const timelineMetadataDeleted = timelineMetadataResult.rowCount || 0;
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

  } catch (error: any) {
    console.error('❌ Error in DELETE /api/cleanup/old-data:', error);
    res.status(500).json({ 
      error: 'データ削除に失敗しました',
      details: error.message 
    });
  }
});

export default router;
