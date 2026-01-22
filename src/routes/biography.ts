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
// POST /api/biography - biography を作成または更新
// ============================================
router.post('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();
    const { edited_content, ai_summary } = req.body;

    console.log('💾 Biography save request:', {
      userId: userId,
      contentLength: edited_content?.length || 0,
      hasSummary: !!ai_summary
    });

    // バリデーション
    if (!edited_content) {
      return res.status(400).json({ error: 'edited_content is required' });
    }

    // 既存の biography を確認
    const existing = db.prepare('SELECT id FROM biography WHERE user_id = ?').get(userId) as any;

    let result;

    if (existing) {
      // 更新
      console.log('📝 Updating existing biography - id:', existing.id);
      const updateStmt = db.prepare(`
        UPDATE biography
        SET edited_content = ?, ai_summary = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `);
      updateStmt.run(edited_content, ai_summary || edited_content, userId);
      result = { lastInsertRowid: existing.id };
    } else {
      // 新規作成
      console.log('✨ Creating new biography');
      const insertStmt = db.prepare(`
        INSERT INTO biography (user_id, edited_content, ai_summary, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);
      result = insertStmt.run(userId, edited_content, ai_summary || edited_content);
    }

    // 保存されたデータを取得して返す
    const savedBiography = db.prepare('SELECT * FROM biography WHERE id = ?').get(result.lastInsertRowid);

    console.log('✅ Biography saved successfully - id:', result.lastInsertRowid);
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
router.get('/', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();

    console.log('📖 Biography fetch request - userId:', userId);  // ← ログ追加
    console.log('🔍 User object:', user);  // ← ユーザー確認用

    const biography = db.prepare('SELECT * FROM biography WHERE user_id = ?').get(userId) as any;

    if (!biography) {
      console.warn('⚠️ Biography not found - userId:', userId);
      // ← データが本当にないか確認
      const allBiographies = db.prepare('SELECT id, user_id FROM biography').all();
      console.warn('📊 All biographies in DB:', allBiographies);
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
router.put('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const db = getDb();
    const { edited_content, ai_summary } = req.body;

    console.log('✏️ Biography update request - id:', id);

    // 本人確認
    const biography = db.prepare('SELECT user_id FROM biography WHERE id = ?').get(id) as any;
    if (!biography) {
      console.warn('⚠️ Biography not found - id:', id);
      return res.status(404).json({ error: 'Biography not found' });
    }

    if (biography.user_id !== user.userId) {
      console.error('❌ Access denied');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const updateStmt = db.prepare(`
      UPDATE biography
      SET edited_content = COALESCE(?, edited_content),
          ai_summary = COALESCE(?, ai_summary),
          updated_at = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(edited_content || null, ai_summary || null, id);

    const updatedBiography = db.prepare('SELECT * FROM biography WHERE id = ?').get(id);

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
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const db = getDb();

    console.log('🗑️ Biography delete request - id:', id);

    // 本人確認
    const biography = db.prepare('SELECT user_id FROM biography WHERE id = ?').get(id) as any;
    if (!biography) {
      console.warn('⚠️ Biography not found - id:', id);
      return res.status(404).json({ error: 'Biography not found' });
    }

    if (biography.user_id !== user.userId) {
      console.error('❌ Access denied');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const deleteStmt = db.prepare('DELETE FROM biography WHERE id = ?');
    deleteStmt.run(id);

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
router.get('/debug/all', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const biographies = db.prepare(`
      SELECT 
        id, 
        user_id, 
        LENGTH(edited_content) as edited_content_length,
        LENGTH(ai_summary) as ai_summary_length,
        SUBSTR(edited_content, 1, 300) as edited_content_preview,
        updated_at 
      FROM biography
    `).all();

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