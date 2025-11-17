import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// ============================================
// GET /api/publisher/users - ユーザー一覧（管理者用）
// ============================================
router.get('/users', (req: Request, res: Response) => {
  try {
    const { status, stage } = req.query;
    
    let query = `
      SELECT 
        u.id, u.name, u.age, u.email, u.phone,
        u.created_at, u.status, u.progress_stage,
        COUNT(p.id) as photo_count,
        COUNT(r.id) as response_count
      FROM users u
      LEFT JOIN photos p ON u.id = p.user_id
      LEFT JOIN responses r ON u.id = r.user_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (status) {
      query += ' AND u.status = ?';
      params.push(status);
    }
    
    if (stage) {
      query += ' AND u.progress_stage = ?';
      params.push(stage);
    }
    
    query += ' GROUP BY u.id ORDER BY u.created_at DESC';
    
    const stmt = db.prepare(query);
    const users = stmt.all(...params);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/publisher/users/:id/progress - 進捗確認
// ============================================
router.get('/users/:id/progress', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const photos = db.prepare('SELECT COUNT(*) as count FROM photos WHERE user_id = ?').get(id) as any;
    const responses = db.prepare('SELECT COUNT(*) as count FROM responses WHERE user_id = ?').get(id) as any;
    const pdfVersions = db.prepare('SELECT COUNT(*) as count FROM pdf_versions WHERE user_id = ?').get(id) as any;
    
    const responsesByStage = db.prepare(`
      SELECT stage, COUNT(*) as count
      FROM responses
      WHERE user_id = ?
      GROUP BY stage
    `).all(id);
    
    res.json({
      user: {
        id: user.id,
        name: user.name,
        status: user.status,
        progress_stage: user.progress_stage,
      },
      stats: {
        photos_uploaded: photos.count,
        responses_count: responses.count,
        pdf_versions: pdfVersions.count,
      },
      responses_by_stage: responsesByStage,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/publisher/users/:id/pdf-versions - PDF版履歴
// ============================================
router.get('/users/:id/pdf-versions', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const stmt = db.prepare(`
      SELECT id, version, status, generated_at, pdf_path
      FROM pdf_versions
      WHERE user_id = ?
      ORDER BY version DESC
    `);
    
    const versions = stmt.all(id);
    res.json(versions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUT /api/publisher/users/:id/finalize - PDF最終版確定
// ============================================
router.put('/users/:id/finalize', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pdfVersionId } = req.body;
    
    if (!pdfVersionId) {
      return res.status(400).json({ error: 'pdfVersionId is required' });
    }
    
    // すべてのバージョンをdraftに
    const resetStmt = db.prepare('UPDATE pdf_versions SET status = ? WHERE user_id = ?');
    resetStmt.run('draft', id);
    
    // 指定されたバージョンをfinalizedに
    const finalizeStmt = db.prepare('UPDATE pdf_versions SET status = ? WHERE id = ?');
    finalizeStmt.run('finalized', pdfVersionId);
    
    // ユーザーのステータスもcompletedに
    const updateUserStmt = db.prepare('UPDATE users SET status = ? WHERE id = ?');
    updateUserStmt.run('completed', id);
    
    res.json({ message: 'PDF finalized successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/publisher/dashboard - ダッシュボード統計
// ============================================
router.get('/dashboard', (req: Request, res: Response) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('active') as any;
    const completedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('completed') as any;
    
    const stageBreakdown = db.prepare(`
      SELECT progress_stage, COUNT(*) as count
      FROM users
      GROUP BY progress_stage
    `).all();
    
    res.json({
      total_users: totalUsers.count,
      active_users: activeUsers.count,
      completed_users: completedUsers.count,
      stage_breakdown: stageBreakdown,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
