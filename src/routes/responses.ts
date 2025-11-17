import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// ============================================
// GET /api/responses - すべての回答取得
// ============================================
router.get('/', (req: Request, res: Response) => {
  try {
    const { userId, stage } = req.query;
    
    let query = 'SELECT * FROM responses WHERE 1=1';
    const params: any[] = [];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    if (stage) {
      query += ' AND stage = ?';
      params.push(stage);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    const responses = stmt.all(...params);
    res.json(responses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST /api/responses - 回答保存
// ============================================
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      userId,
      questionId,
      stage,
      questionText,
      responseText,
      isVoice,
      photoId,
    } = req.body;
    
    if (!userId || !stage || !questionText || !responseText) {
      return res.status(400).json({
        error: 'userId, stage, questionText, responseText are required',
      });
    }
    
    const stmt = db.prepare(
      `INSERT INTO responses (user_id, question_id, stage, question_text, response_text, is_voice, photo_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    
    const result = stmt.run(
      userId,
      questionId || null,
      stage,
      questionText,
      responseText,
      isVoice ? 1 : 0,
      photoId || null
    );
    
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/responses/:id - 特定の回答取得
// ============================================
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM responses WHERE id = ?');
    const response = stmt.get(id);
    
    if (!response) {
      return res.status(404).json({ error: 'Response not found' });
    }
    
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE /api/responses/:id - 回答削除
// ============================================
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM responses WHERE id = ?');
    stmt.run(id);
    res.json({ message: 'Response deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
