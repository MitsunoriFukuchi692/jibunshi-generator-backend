import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

/**
 * パスワードをハッシュ化
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * パスワードを検証
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * JWTトークンを生成
 */
export const generateToken = (userId: number, email: string): string => {
  return jwt.sign(
    { userId, email },
    JWT_SECRET as string,
    { expiresIn: JWT_EXPIRATION } as any
  );
};

/**
 * JWTトークンを検証
 */
export const verifyToken = (token: string): { userId: number; email: string } | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as { userId: number; email: string };
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return null;
  }
};

/**
 * Bearer トークンをヘッダーから抽出
 */
export const extractToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // "Bearer " を削除
};