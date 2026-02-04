import { Router, Request, Response } from 'express';
import { queryRow, queryAll, queryRun } from '../db.js';
import { generateToken, verifyToken, extractToken, hashToken, calculateSessionExpiry } from '../utils/auth.js';

const router = Router();

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 年齢から生年を計算
 */
function calculateBirthYear(age: number): number {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  let birthYear = currentYear - age;
  return birthYear;
}

/**
 * 名前+月日で既存ユーザーを検索
 */
async function findUserByNameAndBirthday(name: string, birthMonth: number, birthDay: number) {
  return await queryRow(
    'SELECT id, name, age, birth_month, birth_day, birth_year FROM users WHERE name = ? AND birth_month = ? AND birth_day = ?',
    [name.trim(), birthMonth, birthDay]
  );
}

/**
 * 同じ名前のユーザーを全て検索（複数人確認用）
 */
async function findUsersByName(name: string) {
  return await queryAll(
    'SELECT id, name, age, birth_month, birth_day FROM users WHERE name = ?',
    [name.trim()]
  );
}

/**
 * セッションを保存（ログイン時）
 */
async function saveSession(userId: number, deviceId: string, token: string): Promise<boolean> {
  try {
    const tokenHash = hashToken(token);
    const expiresAt = calculateSessionExpiry();

    // 既存のセッションがあれば削除
    await queryRun('DELETE FROM sessions WHERE user_id = ?', [userId]);

    // 新しいセッションを保存
    await queryRun(
      `INSERT INTO sessions (user_id, device_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, deviceId, tokenHash, expiresAt.toISOString()]
    );

    console.log(`   ✅ Session saved: userId=${userId}, deviceId=${deviceId}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Failed to save session:`, error);
    return false;
  }
}

/**
 * セッションを検証
 */
async function verifySession(userId: number, token: string): Promise<boolean> {
  try {
    const tokenHash = hashToken(token);
    const session = await queryRow(
      'SELECT id, expires_at FROM sessions WHERE user_id = ? AND token_hash = ?',
      [userId, tokenHash]
    );

    if (!session) {
      console.log(`   ❌ Session not found for userId=${userId}`);
      return false;
    }

    // 有効期限をチェック
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      console.log(`   ❌ Session expired for userId=${userId}`);
      return false;
    }

    // last_activity を更新
    await queryRun('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);

    console.log(`   ✅ Session verified: userId=${userId}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Failed to verify session:`, error);
    return false;
  }
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
  (req as any).token = token;
  next();
};

// ============================================
// POST /api/users/register - ユーザー新規登録
// ============================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, age, birthMonth, birth_month, birthDay, birth_day, pin, deviceId } = req.body;
    
    const bMonth = birthMonth || birth_month;
    const bDay = birthDay || birth_day;

    // バリデーション
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'お名前は必須です。' });
    }

    if (!age || age < 1 || age > 120) {
      return res.status(400).json({ error: '正しい年齢を入力してください（1～120）。' });
    }

    if (!bMonth || bMonth < 1 || bMonth > 12) {
      return res.status(400).json({ error: '正しい月を入力してください（1～12）。' });
    }

    if (!bDay || bDay < 1 || bDay > 31) {
      return res.status(400).json({ error: '正しい日を入力してください（1～31）。' });
    }

    if (!pin || pin.toString().length !== 4 || !/^\d{4}$/.test(pin.toString())) {
      return res.status(400).json({ error: 'PINは4桁の数字で入力してください。' });
    }

    // 同じ名前+月日の組み合わせで重複チェック
    const existingUser = await findUserByNameAndBirthday(name, bMonth, bDay);
    if (existingUser) {
      return res.status(400).json({ error: 'このお名前と生年月日の組み合わせは既に登録されています。' });
    }

    // 生年を計算
    const birthYear = calculateBirthYear(age);

    // ユーザーを登録
    const result = await queryRun(
      `INSERT INTO users (name, age, birth_month, birth_day, birth_year, pin, status, progress_stage)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 'birth') RETURNING id`,
      [name.trim(), age, bMonth, bDay, birthYear, pin.toString()]
    );

    const userId = result.rows?.[0]?.id;
    console.log(`✅ [register] User registered: name="${name.trim()}", userId=${userId}, birth=${bMonth}/${bDay}`);

    // JWTトークンを生成
    const token = generateToken(userId, name.trim());

    // セッションを保存
    const sessionDeviceId = deviceId || `device-${Date.now()}`;
    await saveSession(userId, sessionDeviceId, token);

    res.status(201).json({
      message: '登録が完了しました。',
      token,
      userId: userId,
      user: {
        id: userId,
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
    const users = await findUsersByName(name);

    console.log(`📊 [login/check-name] Database query result`);
    console.log(`   Found ${users.length} user(s)`);
    if (users.length > 0) {
      console.log(`   Users:`, JSON.stringify(users, null, 2));
    }

    if (users.length === 0) {
      console.log(`   ⚠️ No user found with name "${name}"`);
      return res.status(200).json({
        exists: false,
        count: 0,
        message: 'このお名前は登録されていません。新規登録してください。'
      });
    }

    if (users.length === 1) {
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
    console.error('❌ Error in login/check-name:', error);
    res.status(500).json({ error: 'ログイン処理に失敗しました。' });
  }
});

// ============================================
// POST /api/users/login/verify-birthday - ログイン：月日確認
// ============================================
router.post('/login/verify-birthday', async (req: Request, res: Response) => {
  try {
    const { name, birthMonth, birth_month, birthDay, birth_day } = req.body;
    
    const bMonth = birthMonth || birth_month;
    const bDay = birthDay || birth_day;

    if (!name || !bMonth || !bDay) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    console.log(`\n📅 [login/verify-birthday] Verifying birthday for name="${name}"`);

    // 名前+月日でユーザーを検索
    const user = await findUserByNameAndBirthday(name, bMonth, bDay);

    if (!user) {
      console.log(`   ❌ User not found with name="${name}", birthday=${bMonth}/${bDay}`);
      return res.status(404).json({ error: 'このお名前と生年月日の組み合わせが見つかりません。' });
    }

    console.log(`   ✅ User found: ${user.name} (id=${user.id})`);

    res.status(200).json({
      exists: true,
      userId: user.id,
      name: user.name,
      message: 'PINを入力してください。'
    });

  } catch (error: any) {
    console.error('❌ Error in login/verify-birthday:', error);
    res.status(500).json({ error: 'ログイン処理に失敗しました。' });
  }
});

// ============================================
// POST /api/users/login/check-birthday - ログイン：誕生日確認（check-birthdayエイリアス）
// ============================================
router.post('/login/check-birthday', async (req: Request, res: Response) => {
  try {
    const { name, birthMonth, birth_month, birthDay, birth_day } = req.body;
    
    const bMonth = birthMonth || birth_month;
    const bDay = birthDay || birth_day;

    if (!name || !bMonth || !bDay) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    console.log(`\n📅 [login/check-birthday] Verifying birthday for name="${name}"`);

    // 名前+月日でユーザーを検索
    const user = await findUserByNameAndBirthday(name, bMonth, bDay);

    if (!user) {
      console.log(`   ❌ User not found with name="${name}", birthday=${bMonth}/${bDay}`);
      return res.status(404).json({ error: 'このお名前と生年月日の組み合わせが見つかりません。' });
    }

    console.log(`   ✅ User found: ${user.name} (id=${user.id})`);

    res.status(200).json({
      exists: true,
      userId: user.id,
      name: user.name,
      message: 'PINを入力してください。'
    });

  } catch (error: any) {
    console.error('❌ Error in login/check-birthday:', error);
    res.status(500).json({ error: 'ログイン処理に失敗しました。' });
  }
});

// ============================================
// POST /api/users/login/verify-pin - ログイン：PIN検証
// ============================================
router.post('/login/verify-pin', async (req: Request, res: Response) => {
  try {
    const { userId, pin, deviceId } = req.body;

    if (!userId || !pin) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    if (pin.toString().length !== 4 || !/^\d{4}$/.test(pin.toString())) {
      return res.status(400).json({ error: 'PINは4桁の数字で入力してください。' });
    }

    console.log(`\n🔑 [login/verify-pin] Verifying PIN for userId=${userId}`);

    // ユーザーを取得
    const user = await queryRow(
      'SELECT id, name, pin, age FROM users WHERE id = ?',
      [userId]
    );

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

    // セッションを保存
    const sessionDeviceId = deviceId || `device-${Date.now()}`;
    const sessionSaved = await saveSession(user.id, sessionDeviceId, token);

    if (!sessionSaved) {
      return res.status(500).json({ error: 'セッション保存に失敗しました。' });
    }

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
// ============================================
router.post('/login/forgot-pin', async (req: Request, res: Response) => {
  try {
    const { name, birthMonth, birth_month, birthDay, birth_day, newPin } = req.body;
    
    const bMonth = birthMonth || birth_month;
    const bDay = birthDay || birth_day;

    if (!name || !name.trim() || !bMonth || !bDay) {
      return res.status(400).json({ error: '必要な情報が不足しています。' });
    }

    if (!newPin || newPin.toString().length !== 4 || !/^\d{4}$/.test(newPin.toString())) {
      return res.status(400).json({ error: '新しいPINは4桁の数字で入力してください。' });
    }

    // 名前+月日でユーザーを検索
    const user = await findUserByNameAndBirthday(name, bMonth, bDay);

    if (!user) {
      return res.status(404).json({ error: 'このお名前と生年月日の組み合わせが見つかりません。' });
    }

    // PINを更新
    await queryRun('UPDATE users SET pin = ? WHERE id = ?', [newPin.toString(), user.id]);

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
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const token = (req as any).token;

    // セッションを検証
    if (!await verifySession(user.userId, token)) {
      return res.status(401).json({ error: 'セッションが無効です。もう一度ログインしてください。' });
    }

    const userData = await queryRow('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?', [user.userId]);

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
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const token = (req as any).token;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // セッションを検証
    if (!await verifySession(user.userId, token)) {
      return res.status(401).json({ error: 'セッションが無効です。もう一度ログインしてください。' });
    }

    const userData = await queryRow('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?', [id]);

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
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const token = (req as any).token;
    const { age, progress_stage, status } = req.body;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // セッションを検証
    if (!await verifySession(user.userId, token)) {
      return res.status(401).json({ error: 'セッションが無効です。もう一度ログインしてください。' });
    }

    await queryRun(
      `UPDATE users 
       SET age = COALESCE(?, age),
           progress_stage = COALESCE(?, progress_stage),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [age || null, progress_stage || null, status || null, id]
    );

    const updatedUser = await queryRow('SELECT id, name, age, status, progress_stage FROM users WHERE id = ?', [id]);
    res.json(updatedUser);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー情報の更新に失敗しました。' });
  }
});

// ============================================
// DELETE /api/users/:id - ユーザー削除（認証必須、本人のみ）
// ============================================
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const token = (req as any).token;

    // 本人確認
    if (user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // セッションを検証
    if (!await verifySession(user.userId, token)) {
      return res.status(401).json({ error: 'セッションが無効です。もう一度ログインしてください。' });
    }

    await queryRun('DELETE FROM users WHERE id = ?', [id]);
    await queryRun('DELETE FROM sessions WHERE user_id = ?', [id]);

    res.json({ message: 'ユーザーが削除されました。' });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'ユーザー削除に失敗しました。' });
  }
});

// ============================================
// POST /api/users/logout - ログアウト（セッション削除）
// ============================================
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // セッションを削除
    await queryRun('DELETE FROM sessions WHERE user_id = ?', [user.userId]);

    console.log(`✅ [logout] User logged out: userId=${user.userId}`);

    res.json({ message: 'ログアウトしました。' });
  } catch (error: any) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ error: 'ログアウトに失敗しました。' });
  }
});

// ============================================
// DEBUG: GET /api/users/debug/all-users - 全ユーザー確認（テスト用）
// ============================================
router.get('/debug/all-users', async (req: Request, res: Response) => {
  try {
    const users = await queryAll('SELECT id, name, age, birth_month, birth_day, created_at FROM users ORDER BY created_at DESC LIMIT 20', []);
    
    console.log('📊 All users:', users);
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;