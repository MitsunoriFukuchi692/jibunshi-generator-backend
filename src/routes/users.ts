import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateToken, verifyToken, extractToken } from '../utils/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 年齢から生年を計算
 * @param age 年齢
 * @returns 生年（4桁の数字）
 */
function calculateBirthYear(age: number): number {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentDay = currentDate.getDate();

  // 生年を計算（大雑把）
  // 例：2025年1月、年齢65歳 → 1960年生まれ
  let birthYear = currentYear - age;

  // より正確に：誕生日が過ぎていない場合は-1
  // ここでは簡略版（実装側で月日チェック）
  return birthYear;
}

/**
 * 名前+月日で既存ユーザーを検索
 */
function findUserByNameAndBirthday(name: string, birthMonth: number, birthDay: number) {
  const stmt = db.prepare(
    'SELECT id, name, age, birth_month, birth_day, birth_year FROM users WHERE name = ? AND birth_month = ? AND birth_day = ?'
  );
  return stmt.get(name.trim(), birthMonth, birthDay) as any;
}

/**
 * 同じ名前のユーザーを全て検索（複数人確認用）
 */
function findUsersByName(name: string) {
  const stmt = db.prepare(
    'SELECT id, name, age, birth_month, birth_day FROM users WHERE name = ?'
  );
  return stmt.all(name.trim()) as any[];
}

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
// POST /api/users/register - ユーザー新規登録
// 入力項目：名前、年齢、生年月日（月日）、PIN（4桁数字）
// ============================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, age, birthMonth, birthDay, pin } = req.body;

    // バリデーション
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'お名前は必須です。' });
    }

    if (!age || age < 1 || age > 120) {
      return res.status(400).json({ error: '正しい年齢を入力してください（1～120）。' });
    }

    if (!birthMonth || birthMonth < 1 || birthMonth > 12) {
      return res.status(400).json({ error: '正しい月を入力してください（1～12）。' });
    }

    if (!birthDay || birthDay < 1 || birthDay > 31) {
      return res.status(400).json({ error: '正しい日を入力してください（1～31）。' });
    }

    if (!pin || pin.toString().length !== 4 || !/^\d{4}$/.test(pin.toString())) {
      return res.status(400).json({ error: 'PINは4桁の数字で入力してください。' });
    }

    // 同じ名前+月日の組み合わせで重複チェック
    const existingUser = findUserByNameAndBirthday(name, birthMonth, birthDay);
    if (existingUser) {
      return res.status(400).json({ error: 'このお名前と生年月日の組み合わせは既に登録されています。' });
    }

    // 生年を計算
    const birthYear = calculateBirthYear(age);

    // ユーザーを登録
    const stmt = db.prepare(
      `INSERT INTO users (name, age, birth_month, birth_day, birth_year, pin, status, progress_stage)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 'birth')`
    );

    const result = stmt.run(name.trim(), age, birthMonth, birthDay, birthYear, pin.toString());

    console.log(`✅ [register] User registered: name="${name.trim()}", userId=${result.lastInsertRowid}`);

    // JWTトークンを生成
    const token = generateToken(result.lastInsertRowid as number, name.trim());

    res.status(201).json({
      message: '登録が完了しました。',
      token,
      userId: result.lastInsertRowid,
      user: {
        id: result.lastInsertRowid,
        name: name.trim(),
        age,
      },
    });

  } catch (error: any) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'ユーザー登録に失敗しました。' });
  }
});

// ============================================
// POST /api/users/login/check-name - ログイン：名前確認
// 同じ名前が複数いる場合は月日入力を促す
// ============================================
router.post('/login/check-name', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'お名前を入力してください。' });
    }

    console.log(`\n🔍 [login/check-name] Request received at ${new Date().toISOString()}`);
    console.log(`   Input name: "${name}" (trimmed: "${name.trim()}")`);

    // 同じ名前のユーザーを全て検索
    const users = findUsersByName(name);

    console.log(`📊 [login/check-name] Database query result`);
    console.log(`   Found ${users.length} user(s)`);
    if (users.length > 0) {
      console.log(`   Users:`, JSON.stringify(users, null, 2));
    }

    if (users.length === 0) {
      // ユーザーが存在しない
      console.log(`   ⚠️ No user found with name "${name}"`);
      return res.status(200).json({
        exists: false,
        count: 0,
        message: 'このお名前は登録されていません。新規登録してください。'
      });
    }

    if (users.length === 1) {
      // 同じ名前が1人だけ → 月日入力へ（またはPIN直接）
      const user = users[0];
      console.log(`   ✅ Single user found: ${user.name} (id=${user.id})`);
      return res.status(200).json({
        exists: true,
        count: 1,
        userId: user.id,
        name: user.name,
        message: '生年月日を入力してください。'
      });
    }

    // 同じ名前が複数人 → 月日で区別
    console.log(`   👥 Multiple users found: ${users.length}`);
    return res.status(200).json({
      exists: true,
      count: users.length,
      candidates: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        birthMonth: u.birth_month,
        birthDay: u.birth_day,
        age: u.age
      })),
      message: '同じお名前の方が複数おられます。生年月日で区別します。'
    });

  } catch (error: any) {
    console.error('❌ Name check error:', error);
    res.status(500).json({ error: 'エラーが発生しました。' });
  }
});

// ============================================
// POST /api/users/login/verify-birthday - ログイン：月日確認
// ============================================
router.post('/login/verify-birthday', async (req: Request, res: Response) => {
  try {
    const { name, birthMonth, birthDay } = req.body;

    if (!name || !name.trim() || !birthMonth || !birthDay) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) {
      return res.status(400).json({ error: '正しい生年月日を入力してください。' });
    }

    console.log(`\n🔐 [login/verify-birthday] Verifying: ${name} / ${birthMonth}月${birthDay}日`);

    // 名前+月日でユーザーを検索
    const user = findUserByNameAndBirthday(name, birthMonth, birthDay);

    if (!user) {
      console.log(`   ❌ No match found for ${name} / ${birthMonth}月${birthDay}日`);
      return res.status(404).json({ error: 'このお名前と生年月日の組み合わせが見つかりません。もう一度確認してください。' });
    }

    console.log(`   ✅ User verified: ${user.name} (id=${user.id})`);

    // ユーザーが見つかった → PIN入力へ
    res.status(200).json({
      userId: user.id,
      name: user.name,
      age: user.age,
      message: 'PIN（4桁）を入力してください。'
    });

  } catch (error: any) {
    console.error('❌ Birthday verification error:', error);
    res.status(500).json({ error: 'エラーが発生しました。' });
  }
});

// ============================================
// POST /api/users/login/verify-pin - ログイン：PIN検証
// ============================================
router.post('/login/verify-pin', async (req: Request, res: Response) => {
  try {
    const { userId, pin } = req.body;

    if (!userId || !pin) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    if (pin.toString().length !== 4 || !/^\d{4}$/.test(pin.toString())) {
      return res.status(400).json({ error: 'PINは4桁の数字で入力してください。' });
    }

    console.log(`\n🔑 [login/verify-pin] Verifying PIN for userId=${userId}`);

    // ユーザーを取得
    const user = db.prepare(
      'SELECT id, name, pin, age FROM users WHERE id = ?'
    ).get(userId) as any;

    if (!user) {
      console.log(`   ❌ User not found: id=${userId}`);
      return res.status(404).json({ error: 'ユーザーが見つかりません。' });
    }

    // PIN検証
    if (user.pin !== pin.toString()) {
      console.log(`   ❌ PIN mismatch for user ${user.name}`);
      return res.status(401).json({ error: 'PINが正しくありません。もう一度お試しください。' });
    }

    console.log(`   ✅ PIN verified for user: ${user.name}`);

    // JWTトークンを生成
    const token = generateToken(user.id, user.name);

    res.status(200).json({
      message: 'ログインしました。',
      token,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        age: user.age,
      },
    });

  } catch (error: any) {
    console.error('❌ PIN verification error:', error);
    res.status(500).json({ error: 'ログインに失敗しました。' });
  }
});

// ============================================
// POST /api/users/login/forgot-pin - PIN忘れ対応
// 名前+月日で本人確認後、新しいPINを設定
// ============================================
router.post('/login/forgot-pin', async (req: Request, res: Response) => {
  try {
    const { name, birthMonth, birthDay, newPin } = req.body;

    if (!name || !name.trim() || !birthMonth || !birthDay) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    if (!newPin || newPin.toString().length !== 4 || !/^\d{4}$/.test(newPin.toString())) {
      return res.status(400).json({ error: '新しいPINは4桁の数字で入力してください。' });
    }

    // 名前+月日でユーザーを検索
    const user = findUserByNameAndBirthday(name, birthMonth, birthDay);

    if (!user) {
      return res.status(404).json({ error: 'このお名前と生年月日の組み合わせが見つかりません。' });
    }

    // PINを更新
    const stmt = db.prepare('UPDATE users SET pin = ? WHERE id = ?');
    stmt.run(newPin.toString(), user.id);

    console.log(`✅ [forgot-pin] PIN updated for user: ${user.name}`);

    res.status(200).json({
      message: 'PINが変更されました。新しいPINでログインしてください。',
      userId: user.id,
    });

  } catch (error: any) {
    console.error('❌ Forgot PIN error:', error);
    res.status(500).json({ error: 'PIN変更に失敗しました。' });
  }
});

// ============================================
// GET /api/users/me - 現在のユーザー情報取得（認証必須）
// ============================================
router.get('/me', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stmt = db.prepare('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?');
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

    const stmt = db.prepare('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?');
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
    const { age, progress_stage, status } = req.body;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const stmt = db.prepare(
      `UPDATE users 
       SET age = COALESCE(?, age),
           progress_stage = COALESCE(?, progress_stage),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );

    stmt.run(age, progress_stage, status, id);

    const updatedUser = db.prepare('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?').get(id);
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