import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { userId, stage } = req.query;
    let query = 'SELECT * FROM timeline WHERE 1=1';
    const params: any[] = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (stage) {
      query += ' AND stage = ?';
      params.push(stage);
    }

    query += ' ORDER BY age ASC';

    const stmt = db.prepare(query);
    const timelines = stmt.all(...params);
    res.json(timelines);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { user_id, age, year, stage, event_title, event_description } = req.body;

    if (!user_id || !event_title || !event_description) {
      return res.status(400).json({
        error: 'user_id, event_title, event_description are required',
      });
    }

    const stmt = db.prepare(
      `INSERT INTO timeline (user_id, age, year, stage, event_title, event_description)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const result = stmt.run(
      user_id,
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      stage || 'turning_points',
      event_title,
      event_description
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      user_id,
      age,
      year,
      stage: stage || 'turning_points',
      event_title,
      event_description,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM timeline WHERE id = ?');
    const timeline = stmt.get(id);

    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    res.json(timeline);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { age, year, stage, event_title, event_description, edited_content } = req.body;

    const stmt = db.prepare(
      `UPDATE timeline 
       SET age = ?, year = ?, stage = ?, event_title = ?, event_description = ?, edited_content = ?
       WHERE id = ?`
    );

    stmt.run(
      age ? parseInt(age) : null,
      year ? parseInt(year) : null,
      stage,
      event_title,
      event_description,
      edited_content || null,
      id
    );

    res.json({ message: 'Timeline updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM timeline WHERE id = ?');
    stmt.run(id);
    res.json({ message: 'Timeline deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;