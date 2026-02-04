import { Router, Request, Response } from 'express';
import { queryRow, queryAll, queryRun } from '../db.js';
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
// POST /api/biography - biography を作成または更新
// ============================================
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const { edited_content, ai_summary } = req.body;

    console.log('💾 Biography save request:', {
      userId: userId,
      contentLength: edited_content?.length || 0,
      hasSummary: !!ai_summary
    });

    if (!edited_content) {
      console.error('❌ edited_content is empty!');
      return res.status(400).json({ error: 'edited_content is required' });
    }

    // 既存の biography を確認
    const existing = await queryRow('SELECT id FROM biography WHERE user_id = ?', [userId]);
    console.log('🔍 Existing biography:', existing);

    let result;

    if (existing) {
      console.log('📝 Updating existing biography - id:', existing.id);
      await queryRun(
        `UPDATE biography SET edited_content = ?, ai_summary = ?, updated_at = NOW() WHERE user_id = ?`,
        [edited_content, ai_summary || edited_content, userId]
      );
      result = { id: existing.id };
    } else {
      console.log('✨ Creating new biography');
      const insertResult = await queryRun(
        `INSERT INTO biography (user_id, edited_content, ai_summary, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW()) RETURNING id`,
        [userId, edited_content, ai_summary || edited_content]
      );
      result = { id: insertResult.rows?.[0]?.id || null };
      console.log('📊 Insert result:', result);
    }

    const savedBiography = await queryRow('SELECT * FROM biography WHERE id = ?', [result.id]);
    console.log('✅ Saved biography:', savedBiography);

    res.status(201).json({
      success: true,
      message: existing ? 'Biography updated successfully' : 'Biography created successfully',
      data: savedBiography
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/biography:', error);
    res.status(500).json({
      error: 'Failed to save biography',
      details: error.message
    });
  }
});

// ============================================
// GET /api/biography - biography を取得
// ============================================
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;

    console.log('📖 Biography fetch request - userId:', userId);

    const biography = await queryRow('SELECT * FROM biography WHERE user_id = ?', [userId]);

    if (!biography) {
      console.warn('⚠️ Biography not found - userId:', userId);
      return res.status(404).json({ error: 'Biography not found' });
    }

    console.log('✅ Biography fetched - id:', biography.id);
    res.json({
      success: true,
      data: biography
    });
  } catch (error: any) {
    console.error('❌ Error in GET /api/biography:', error);
    res.status(500).json({
      error: 'Failed to fetch biography',
      details: error.message
    });
  }
});

// ============================================
// PUT /api/biography/:id - biography を更新
// ============================================
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { edited_content, ai_summary } = req.body;

    console.log('✏️ Biography update request - id:', id);

    const biography = await queryRow('SELECT user_id FROM biography WHERE id = ?', [id]);
    if (!biography) {
      console.warn('⚠️ Biography not found - id:', id);
      return res.status(404).json({ error: 'Biography not found' });
    }

    if (biography.user_id !== user.userId) {
      console.error('❌ Access denied');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    await queryRun(
      `UPDATE biography SET edited_content = COALESCE(?, edited_content), ai_summary = COALESCE(?, ai_summary), updated_at = NOW() WHERE id = ?`,
      [edited_content || null, ai_summary || null, id]
    );

    const updatedBiography = await queryRow('SELECT * FROM biography WHERE id = ?', [id]);

    console.log('✅ Biography updated successfully - id:', id);
    res.json({
      success: true,
      message: 'Biography updated successfully',
      data: updatedBiography
    });

  } catch (error: any) {
    console.error('❌ Error in PUT /api/biography:', error);
    res.status(500).json({
      error: 'Failed to update biography',
      details: error.message
    });
  }
});

// ============================================
// DELETE /api/biography/:id - biography を削除
// ============================================
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    console.log('🗑️ Biography delete request - id:', id);

    const biography = await queryRow('SELECT user_id FROM biography WHERE id = ?', [id]);
    if (!biography) {
      console.warn('⚠️ Biography not found - id:', id);
      return res.status(404).json({ error: 'Biography not found' });
    }

    if (biography.user_id !== user.userId) {
      console.error('❌ Access denied');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    await queryRun('DELETE FROM biography WHERE id = ?', [id]);

    console.log('✅ Biography deleted successfully - id:', id);
    res.json({
      success: true,
      message: 'Biography deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error in DELETE /api/biography:', error);
    res.status(500).json({
      error: 'Failed to delete biography',
      details: error.message
    });
  }
});

// ============================================
// ⚠️ デバッグ用：全biography を取得（本番確認用）
// ============================================
router.get('/debug/all', async (req: Request, res: Response) => {
  try {
    const biographies = await queryAll(
      `SELECT id, user_id, LENGTH(edited_content) as edited_content_length, LENGTH(ai_summary) as ai_summary_length, SUBSTR(edited_content, 1, 300) as edited_content_preview, updated_at FROM biography`
    );

    console.log('📊 All biographies:', biographies);
    res.json({
      count: biographies.length,
      data: biographies
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
