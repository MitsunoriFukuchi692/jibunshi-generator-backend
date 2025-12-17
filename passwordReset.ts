/**
 * パスワードリセット機能
 * - パスワードリセットのリクエスト
 * - メール送信
 * - リセットトークンの検証
 * - 新パスワードの設定
 */

import { Request, Response, NextFunction } from 'express';
import { Database } from 'better-sqlite3';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { validatePassword, sanitizeInput } from './securityMiddleware';
import { hashPassword, verifyPassword } from '../utils/auth';

// ==================== 環境変数から送信者メールを取得 ====================

const MAIL_USER = process.env.MAIL_USER || 'noreply@example.com';
const MAIL_PASSWORD = process.env.MAIL_PASSWORD || '';
const APP_URL = process.env.APP_URL || 'https://robostudy.jp';
const PASSWORD_RESET_TIMEOUT = 60 * 60 * 1000; // 1時間

// ==================== メール送信設定 ====================

const transporter = nodemailer.createTransport({
  service: 'gmail', // または他のメールサービス
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASSWORD, // App Passwordを使用
  },
});

// ==================== パスワードリセットトークン管理 ====================

/**
 * リセットトークンを生成
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * リセットトークンのハッシュ値を生成
 */
export const hashResetToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ==================== メール送信関数 ====================

/**
 * パスワードリセットメールを送信
 */
export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string
): Promise<boolean> => {
  try {
    const resetUrl = `${APP_URL}/jibunshi/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: MAIL_USER,
      to: email,
      subject: '【自分史アプリ】パスワードリセットのお知らせ',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>パスワードリセットのお知らせ</h2>
          
          <p>いつも自分史アプリをご利用いただきありがとうございます。</p>
          
          <p>パスワードのリセットをご希望いただいたため、
          以下のリンクをクリックして新しいパスワードを設定してください。</p>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #27ae60; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              パスワードをリセットする
            </a>
          </p>
          
          <p><strong>⚠️ セキュリティに関する重要な注意:</strong></p>
          <ul>
            <li>このリンクは1時間有効です</li>
            <li>心当たりがない場合は、このメールを無視してください</li>
            <li>パスワードリセットのリクエストはご本人のみが行ってください</li>
          </ul>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          
          <p style="font-size: 12px; color: #7f8c8d;">
            または、以下のURLをブラウザのアドレスバーにコピー・ペーストしてください:<br>
            <code>${resetUrl}</code>
          </p>
          
          <p style="font-size: 12px; color: #7f8c8d; margin-top: 30px;">
            自分史アプリ サポートチーム<br>
            このメールは自動送信です。返信しないでください。
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✓ パスワードリセットメールを送信しました: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ メール送信エラー:', error);
    return false;
  }
};

/**
 * パスワードリセット完了メールを送信
 */
export const sendPasswordResetConfirmationEmail = async (
  email: string
): Promise<boolean> => {
  try {
    const mailOptions = {
      from: MAIL_USER,
      to: email,
      subject: '【自分史アプリ】パスワード変更完了のお知らせ',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>パスワード変更完了</h2>
          
          <p>ご登録いただいたメールアドレスのパスワードが
          正常に変更されました。</p>
          
          <p style="background-color: #d4edda; padding: 15px; border-radius: 4px; color: #155724;">
            ✓ パスワードは安全に更新されました
          </p>
          
          <p><strong>セキュリティのご確認:</strong></p>
          <ul>
            <li>パスワードは定期的に変更することをお勧めします</li>
            <li>パスワードは他のサービスと重複させないでください</li>
            <li>心当たりがない場合はすぐにお問い合わせください</li>
          </ul>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          
          <p style="font-size: 12px; color: #7f8c8d; margin-top: 30px;">
            自分史アプリ サポートチーム<br>
            このメールは自動送信です。返信しないでください。
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✓ パスワード変更完了メールを送信しました: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ メール送信エラー:', error);
    return false;
  }
};

// ==================== データベース操作 ====================

/**
 * パスワードリセットトークンをDBに保存
 */
export const saveResetToken = (
  db: Database,
  userId: number,
  resetToken: string
): boolean => {
  try {
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TIMEOUT).toISOString();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO password_reset_tokens
      (user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    stmt.run(userId, tokenHash, expiresAt);
    console.log(`✓ リセットトークンを保存しました: userId=${userId}`);
    return true;
  } catch (error) {
    console.error('❌ トークン保存エラー:', error);
    return false;
  }
};

/**
 * リセットトークンを検証
 */
export const validateResetToken = (
  db: Database,
  userId: number,
  resetToken: string
): boolean => {
  try {
    const tokenHash = hashResetToken(resetToken);

    const stmt = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE user_id = ? AND token_hash = ? AND expires_at > datetime('now')
      LIMIT 1
    `);

    const record = stmt.get(userId, tokenHash) as any;
    return !!record;
  } catch (error) {
    console.error('❌ トークン検証エラー:', error);
    return false;
  }
};

/**
 * パスワードをリセット
 */
export const resetPassword = async (
  db: Database,
  userId: number,
  newPassword: string
): Promise<boolean> => {
  try {
    // パスワードの強度を検証
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.error);
    }

    // パスワードをハッシュ化
    const hashedPassword = await hashPassword(newPassword);

    // DBを更新
    const updateStmt = db.prepare(`
      UPDATE users SET password = ? WHERE id = ?
    `);
    updateStmt.run(hashedPassword, userId);

    // リセットトークンを削除（使用済みにする）
    const deleteStmt = db.prepare(`
      DELETE FROM password_reset_tokens WHERE user_id = ?
    `);
    deleteStmt.run(userId);

    console.log(`✓ パスワードをリセットしました: userId=${userId}`);
    return true;
  } catch (error) {
    console.error('❌ パスワードリセットエラー:', error);
    return false;
  }
};

// ==================== API エンドポイント ====================

/**
 * パスワードリセット要求エンドポイント
 * POST /api/auth/forgot-password
 */
export const forgotPasswordHandler = async (
  req: Request,
  res: Response,
  db: Database
) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'メールアドレスを入力してください' });
    }

    // ユーザーを検索
    const stmt = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    const user = stmt.get(sanitizeInput(email)) as any;

    if (!user) {
      // セキュリティ：ユーザーが存在しない場合も成功メッセージを返す（ユーザー列挙対策）
      return res.json({
        message: 'メールアドレスの登録確認が完了しました。受信箱またはスパムフォルダをご確認ください。',
      });
    }

    // リセットトークンを生成
    const resetToken = generateResetToken();

    // トークンを保存
    const tokenSaved = saveResetToken(db, user.id, resetToken);
    if (!tokenSaved) {
      return res.status(500).json({ message: 'パスワードリセットの処理に失敗しました' });
    }

    // メールを送信
    const mailSent = await sendPasswordResetEmail(user.email, resetToken);
    if (!mailSent) {
      return res.status(500).json({ message: 'メール送信に失敗しました' });
    }

    res.json({
      message: 'メールアドレスの登録確認が完了しました。受信箱またはスパムフォルダをご確認ください。',
    });
  } catch (error: any) {
    console.error('❌ forgotPassword エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

/**
 * パスワードリセット検証エンドポイント
 * POST /api/auth/verify-reset-token
 */
export const verifyResetTokenHandler = async (
  req: Request,
  res: Response,
  db: Database
) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ message: '無効なリセットリンクです' });
    }

    // トークンを検証
    const isValid = validateResetToken(db, userId, token);

    if (!isValid) {
      return res.status(400).json({ message: 'リセットリンクが無効または期限切れです' });
    }

    res.json({ message: '検証成功' });
  } catch (error: any) {
    console.error('❌ verifyResetToken エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

/**
 * パスワードリセット実行エンドポイント
 * POST /api/auth/reset-password
 */
export const resetPasswordHandler = async (
  req: Request,
  res: Response,
  db: Database
) => {
  try {
    const { userId, token, newPassword, confirmPassword } = req.body;

    // 入力値の検証
    if (!userId || !token || !newPassword) {
      return res.status(400).json({ message: '必須フィールドが不足しています' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'パスワードが一致しません' });
    }

    // トークンを検証
    const isValid = validateResetToken(db, userId, token);
    if (!isValid) {
      return res.status(400).json({ message: 'リセットリンクが無効または期限切れです' });
    }

    // パスワードをリセット
    const resetSuccess = await resetPassword(db, userId, newPassword);
    if (!resetSuccess) {
      return res.status(400).json({ message: 'パスワードが要件を満たしていません' });
    }

    // 完了メールを送信
    const userStmt = db.prepare('SELECT email FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;
    if (user) {
      await sendPasswordResetConfirmationEmail(user.email);
    }

    res.json({ message: 'パスワードが正常に変更されました。新しいパスワードでログインしてください。' });
  } catch (error: any) {
    console.error('❌ resetPassword エラー:', error);
    res.status(500).json({ message: 'エラーが発生しました' });
  }
};

// ==================== データベース初期化 ====================

/**
 * password_reset_tokens テーブルを作成
 */
export const createPasswordResetTokensTable = (db: Database): void => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // インデックスを作成（検索高速化）
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id 
      ON password_reset_tokens(user_id)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires_at 
      ON password_reset_tokens(expires_at)
    `);

    console.log('✓ password_reset_tokens テーブルを作成しました');
  } catch (error) {
    console.error('❌ テーブル作成エラー:', error);
  }
};

// ==================== 期限切れトークン削除（クリーンアップ） ====================

/**
 * 期限切れのリセットトークンを削除
 */
export const cleanupExpiredTokens = (db: Database): void => {
  try {
    const stmt = db.prepare(`
      DELETE FROM password_reset_tokens
      WHERE expires_at <= datetime('now')
    `);

    const result = stmt.run();
    if ((result.changes || 0) > 0) {
      console.log(`✓ 期限切れトークン${result.changes}件を削除しました`);
    }
  } catch (error) {
    console.error('❌ トークン削除エラー:', error);
  }
};

/**
 * 定期的にクリーンアップを実行
 */
export const startCleanupTask = (db: Database): void => {
  // 1時間ごとにクリーンアップを実行
  setInterval(() => {
    cleanupExpiredTokens(db);
  }, 60 * 60 * 1000);

  console.log('✓ トークンクリーンアップタスクを開始しました');
};
