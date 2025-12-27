import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';
/**
 * パスワードをハッシュ化
 */
export const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};
/**
 * パスワードを検証
 */
export const verifyPassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};
/**
 * JWTトークンを生成
 */
export const generateToken = (userId, email) => {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
};
/**
 * JWTトークンを検証
 */
export const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        console.error('❌ Token verification failed:', error);
        return null;
    }
};
/**
 * Bearer トークンをヘッダーから抽出
 */
export const extractToken = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7); // "Bearer " を削除
};
//# sourceMappingURL=auth.js.map