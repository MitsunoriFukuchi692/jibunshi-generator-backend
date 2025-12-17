import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, verifyPassword, generateToken, verifyToken, extractToken } from '../utils/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

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

  (req as any).user = decoded; // ユーザー情報をリクエストに追加
  next();
};

// ============================================
// POST /api/users/register - ユーザー登録（メール＋パスワード＋名前＋年齢）
// ============================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, age } = req.body;

    // バリデーション
    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードは必須です。' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'パスワードは6文字以上である必要があります。' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '名前は必須です。' });
    }

    if (!age || age < 1 || age > 120) {
      return res.status(400).json({ error: '正しい年齢を入力してください（1〜120）。' });
    }

    // メールアドレスの重複チェック
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
    }

    // パスワードをハッシュ化
    const hashedPassword = await hashPassword(password);

    // ユーザーを登録（名前と年齢を保存）
    const stmt = db.prepare(
      `INSERT INTO users (name, email, password, age, birth_date, gender, address, occupation, bio, status, progress_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'birth')`
    );

    const result = stmt.run(name, email, hashedPassword, age, null, null, null, null, null);

    // JWTトークンを生成
    const token = generateToken(result.lastInsertRowid as number, email);

    res.status(201).json({
      message: '登録が完了しました。',
      token,
      userId: result.lastInsertRowid,
      user: {
        id: result.lastInsertRowid,
        name,
        email,
        age,
      },
    });

  } catch (error: any) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'ユーザー登録に失敗しました。' });
  }
});

// ============================================
// POST /api/users/login - ログイン/新規登録（存在しなければ自動登録）
// ============================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, name, age } = req.body;

    // バリデーション
    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードは必須です。' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'パスワードは6文字以上である必要があります。' });
    }

    // ユーザーを検索
    let user = db.prepare('SELECT id, email, password, name, age FROM users WHERE email = ?').get(email) as any;

    // ユーザーが存在しない場合は自動登録
    if (!user) {
      try {
        const hashedPassword = await hashPassword(password);
        
        // 新規登録時は name と age が必須
        const userName = name && name.trim() ? name : 'ユーザー';
        const userAge = age && age >= 1 && age <= 120 ? age : null;
        
        const stmt = db.prepare(
          `INSERT INTO users (name, email, password, age, birth_date, gender, address, occupation, bio, status, progress_stage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'birth')`
        );
        
        const result = stmt.run(userName, email, hashedPassword, userAge, null, null, null, null, null);
        user = {
          id: result.lastInsertRowid,
          email,
          password: hashedPassword,
          name: userName,
          age: userAge
        };
      } catch (registerError: any) {
        console.error('❌ Auto-registration error:', registerError);
        return res.status(500).json({ error: '登録に失敗しました。' });
      }
    } else {
      // ユーザーが存在する場合、パスワードを検証
      const isPasswordValid = await verifyPassword(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません。' });
      }
    }

    // JWTトークンを生成
    const token = generateToken(user.id, user.email);

    res.json({
      message: 'ログインに成功しました。',
      token,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        age: user.age,
      },
    });
    
  } catch (error: any) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました。' });
  }
});

// ============================================
// GET /api/users/me - 現在のユーザー情報取得（認証必須）
// ============================================
router.get('/me', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stmt = db.prepare('SELECT id, name, email, age, birth_date, gender, address, occupation, bio, status, progress_stage FROM users WHERE id = ?');
    const userData = stmt.get(user.userId);

    if (!userData) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    res.json(userData);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー情報の取得に失敗しました。' });
  }
});

// ============================================
// GET /api/users/:id - 特定ユーザー取得（認証必須、本人のみ）
// ============================================
router.get('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare('SELECT id, name, email, age, birth_date, gender, address, occupation, bio, status, progress_stage FROM users WHERE id = ?');
    const userData = stmt.get(id);

    if (!userData) {
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    res.json(userData);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー情報の取得に失敗しました。' });
  }
});

// ============================================
// PUT /api/users/:id - ユーザー情報更新（認証必須、本人のみ）
// ============================================
router.put('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const { name, age, phone, progress_stage, status } = req.body;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare(
      `UPDATE users 
       SET name = COALESCE(?, name),
           age = COALESCE(?, age),
           phone = COALESCE(?, phone),
           progress_stage = COALESCE(?, progress_stage),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    stmt.run(name, age, phone, progress_stage, status, id);

    const updatedUser = db.prepare('SELECT id, name, email, age, birth_date, gender, address, occupation, bio, status, progress_stage FROM users WHERE id = ?').get(id);
    res.json(updatedUser);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー情報の更新に失敗しました。' });
  }
});

// ============================================
// DELETE /api/users/:id - ユーザー削除（認証必須、本人のみ）
// ============================================
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(id);
    res.json({ message: 'ユーザーが削除されました。' });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー削除に失敗しました。' });
  }
});

export default router;