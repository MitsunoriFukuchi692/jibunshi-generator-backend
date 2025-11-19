import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// ============================================
// GET /api/users - すべてのユーザー取得
// ============================================
router.get('/', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare('SELECT * FROM users');
    const users = stmt.all();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/users/:id - 特定ユーザー取得
// ============================================
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/users - ユーザー登録
// ============================================
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, age, birth_date, gender, address, occupation, bio } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const stmt = db.prepare(
      `INSERT INTO users (name, age, birth_date, gender, address, occupation, bio, status, progress_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'birth')`
    );
    
    const result = stmt.run(name, age || null, birth_date || null, gender || null, address || null, occupation || null, bio || null);
    
    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      age,
      birth_date,
      gender,
      address,
      occupation,
      bio,
      status: 'active',
      progress_stage: 'birth',
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// PUT /api/users/:id - ユーザー情報更新
// ============================================
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, age, email, phone, progress_stage, status } = req.body;
    
    const stmt = db.prepare(
      `UPDATE users 
       SET name = COALESCE(?, name),
           age = COALESCE(?, age),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           progress_stage = COALESCE(?, progress_stage),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    
    stmt.run(name, age, email, phone, progress_stage, status, id);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE /api/users/:id - ユーザー削除
// ============================================
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
