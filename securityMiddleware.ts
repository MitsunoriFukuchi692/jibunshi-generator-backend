/**
 * バックエンド用セキュリティミドルウェア
 * - 入力値検証
 * - XSS対策（サニタイズ）
 * - レート制限
 * - CORS設定
 */

import { Request, Response, NextFunction } from 'express';

// ==================== レート制限 ====================

interface RequestRecord {
  count: number;
  resetTime: number;
}

const requestCounts: Map<string, RequestRecord> = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS_PER_MINUTE = 100; // 1分あたり100リクエスト
const MAX_FAILED_LOGINS = 5; // 5回失敗でロック
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15分

interface FailedLogin {
  count: number;
  resetTime: number;
}

const failedLogins: Map<string, FailedLogin> = new Map();

/**
 * レート制限ミドルウェア
 */
export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const clientIp = req.ip || 'unknown';
  const now = Date.now();

  let record = requestCounts.get(clientIp);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    requestCounts.set(clientIp, record);
  }

  record.count++;

  // レート制限チェック
  if (record.count > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      message: 'リクエストが多すぎます。しばらく待ってからお試しください。',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
  }

  // ヘッダーに残りリクエスト数を設定
  res.set('X-RateLimit-Remaining', (MAX_REQUESTS_PER_MINUTE - record.count).toString());
  res.set('X-RateLimit-Reset', record.resetTime.toString());

  next();
};

/**
 * ログイン試行回数チェック（ブルートフォース対策）
 */
export const checkFailedLoginAttempts = (email: string): boolean => {
  const now = Date.now();
  const record = failedLogins.get(email);

  if (!record || now > record.resetTime) {
    return true; // ロックされていない
  }

  if (record.count >= MAX_FAILED_LOGINS) {
    return false; // ロック中
  }

  return true;
};

/**
 * ログイン失敗を記録
 */
export const recordFailedLogin = (email: string): void => {
  const now = Date.now();
  const record = failedLogins.get(email);

  if (!record || now > record.resetTime) {
    failedLogins.set(email, {
      count: 1,
      resetTime: now + FAILED_LOGIN_WINDOW_MS,
    });
  } else {
    record.count++;
  }
};

/**
 * ログイン成功時に失敗カウントをリセット
 */
export const resetFailedLogin = (email: string): void => {
  failedLogins.delete(email);
};

// ==================== 入力値検証 ====================

/**
 * メールアドレスの形式を検証
 */
export const validateEmail = (email: string): {
  isValid: boolean;
  error?: string;
} => {
  const trimmed = email.trim();

  if (!trimmed) {
    return { isValid: false, error: 'メールアドレスは必須です' };
  }

  if (trimmed.length > 255) {
    return { isValid: false, error: 'メールアドレスが長すぎます' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: '有効なメールアドレスを入力してください' };
  }

  return { isValid: true };
};

/**
 * パスワードの強度を検証
 */
export const validatePassword = (password: string): {
  isValid: boolean;
  error?: string;
} => {
  if (!password) {
    return { isValid: false, error: 'パスワードは必須です' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'パスワードは8文字以上である必要があります' };
  }

  if (password.length > 128) {
    return { isValid: false, error: 'パスワードが長すぎます' };
  }

  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'パスワードに大文字を含める必要があります' };
  }

  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: 'パスワードに小文字を含める必要があります' };
  }

  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'パスワードに数字を含める必要があります' };
  }

  return { isValid: true };
};

/**
 * 名前の妥当性を検証
 */
export const validateName = (name: string): {
  isValid: boolean;
  error?: string;
} => {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: '名前は必須です' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: '名前は100文字以内である必要があります' };
  }

  return { isValid: true };
};

/**
 * 年齢の妥当性を検証
 */
export const validateAge = (age: number): {
  isValid: boolean;
  error?: string;
} => {
  if (!Number.isInteger(age)) {
    return { isValid: false, error: '年齢は整数である必要があります' };
  }

  if (age < 1 || age > 150) {
    return { isValid: false, error: '年齢は1～150の間である必要があります' };
  }

  return { isValid: true };
};

/**
 * 生年月日の妥当性を検証
 */
export const validateBirthDate = (dateString: string): {
  isValid: boolean;
  error?: string;
} => {
  if (!dateString) {
    return { isValid: false, error: '生年月日は必須です' };
  }

  const date = new Date(dateString);
  const today = new Date();

  if (isNaN(date.getTime())) {
    return { isValid: false, error: '正しい日付を入力してください' };
  }

  if (date > today) {
    return { isValid: false, error: '生年月日は今日より前である必要があります' };
  }

  const age = today.getFullYear() - date.getFullYear();
  if (age > 150) {
    return { isValid: false, error: '正しい生年月日を入力してください' };
  }

  return { isValid: true };
};

// ==================== XSS対策（サニタイズ） ====================

/**
 * HTML特殊文字をエスケープ
 */
export const escapeHtml = (text: string): string => {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (char) => map[char]);
};

/**
 * 入力文字列をサニタイズ
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  // 前後の空白を削除
  let sanitized = input.trim();

  // 危険なタグやスクリプトを削除
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  // SQLインジェクション対策（予防的）
  sanitized = sanitized.replace(/['";]/g, (char) => {
    const escapeMap: { [key: string]: string } = {
      "'": "''",
      '"': '""',
      ';': '',
    };
    return escapeMap[char] || char;
  });

  return sanitized;
};

/**
 * リクエストボディをサニタイズするミドルウェア
 */
export const sanitizeBodyMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.body) {
    return next();
  }

  const sanitizedBody: any = {};

  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string') {
      sanitizedBody[key] = sanitizeInput(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitizedBody[key] = value;
    } else if (Array.isArray(value)) {
      sanitizedBody[key] = value.map((v) =>
        typeof v === 'string' ? sanitizeInput(v) : v
      );
    } else {
      sanitizedBody[key] = value;
    }
  }

  req.body = sanitizedBody;
  next();
};

// ==================== リクエスト検証 ====================

/**
 * 必須フィールドの検証
 */
export const validateRequiredFields = (
  requiredFields: string[]
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `必須フィールドが不足しています: ${missingFields.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * ペイロードサイズチェック
 */
export const validatePayloadSize = (maxSize: number = 10 * 1024) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > maxSize) {
      return res.status(413).json({
        message: `リクエストサイズが大きすぎます（最大${maxSize / 1024}KB）`,
      });
    }

    next();
  };
};

// ==================== セキュリティヘッダー ====================

/**
 * セキュリティヘッダーを設定するミドルウェア
 */
export const securityHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // XSS対策
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // CSRF対策
  res.setHeader('X-CSRF-Token', req.csrfToken?.() || 'csrf-token');

  // セキュアなコンテンツポリシー
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self';"
  );

  // キャッシュ制御（機密情報の漏洩防止）
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
};

// ==================== エラーハンドリング ====================

/**
 * グローバルエラーハンドラー
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('❌ エラー:', {
    message: err.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // 本番環境では詳細なエラーを返さない
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment ? err.message : '予期しないエラーが発生しました';

  res.status(err.status || 500).json({
    message: errorMessage,
    ...(isDevelopment && { stack: err.stack }),
  });
};

// ==================== ロギング ====================

/**
 * リクエスト/レスポンスロギング
 */
export const loggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 400) {
      console.warn('⚠️ レスポンスエラー:', log);
    } else {
      console.log('✓ リクエスト成功:', log);
    }
  });

  next();
};

// ==================== データ暗号化（オプション） ====================

/**
 * 個人情報の暗号化・復号化（Node.js crypto使用）
 */
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-12345';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

/**
 * データを暗号化
 */
export const encryptData = (data: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0')),
    iv
  );

  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * データを復号化
 */
export const decryptData = (encryptedData: string): string => {
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0')),
    iv
  );

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
};

// ==================== デバッグ用ユーティリティ ====================

/**
 * ローカルストレージをクリア（開発用）
 */
export const clearRateLimits = (): void => {
  requestCounts.clear();
  failedLogins.clear();
  console.log('✓ レート制限をクリアしました');
};
