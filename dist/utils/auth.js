// 📁 server/src/utils/auth.ts
// ユーザー認証ユーティリティ（JWT トークン管理）
import jwt from 'jsonwebtoken';
// JWT シークレットキー（環境変数から取得）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
// ============================================
// トークン生成
// ============================================
/**
 * JWTトークンを生成
 * @param userId ユーザーID
 * @param name ユーザー名（オプション）
 * @returns JWTトークン
 */
export function generateToken(userId, name) {
    const payload = {
        userId,
        name: name || '',
        iat: Math.floor(Date.now() / 1000),
    };
    const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: '7d', // 7日間有効
    });
    return token;
}
// ============================================
// トークン検証
// ============================================
/**
 * JWTトークンを検証
 * @param token JWTトークン
 * @returns デコードされたペイロード（検証失敗時は null）
 */
export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return {
            userId: decoded.userId,
            name: decoded.name || '',
            iat: decoded.iat,
        };
    }
    catch (error) {
        console.error('❌ Token verification failed:', error instanceof Error ? error.message : error);
        return null;
    }
}
// ============================================
// Authorization ヘッダーからトークン抽出
// ============================================
/**
 * Authorization ヘッダーからトークンを抽出
 * 形式: "Bearer <token>"
 * @param authHeader Authorization ヘッダー
 * @returns トークン（ない場合は null）
 */
export function extractToken(authHeader) {
    if (!authHeader) {
        return null;
    }
    // "Bearer <token>" 形式を想定
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    return parts[1];
}
// ============================================
// トークン更新（オプション）
// ============================================
/**
 * 有効期限内のトークンを更新
 * @param oldToken 古いトークン
 * @returns 新しいトークン（失敗時は null）
 */
export function refreshToken(oldToken) {
    const decoded = verifyToken(oldToken);
    if (!decoded) {
        return null;
    }
    // 新しいトークンを生成
    return generateToken(decoded.userId, decoded.name);
}
// ============================================
// トークン情報取得（デバッグ用）
// ============================================
/**
 * トークンの情報を取得（デバッグ用）
 * @param token JWTトークン
 * @returns トークン情報
 */
export function getTokenInfo(token) {
    try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded) {
            return null;
        }
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = decoded.payload.exp ? `${Math.floor((decoded.payload.exp - now) / 60)}分後` : '不明';
        return {
            userId: decoded.payload.userId,
            name: decoded.payload.name || '',
            expiresIn,
        };
    }
    catch (error) {
        console.error('❌ Failed to get token info:', error);
        return null;
    }
}
export default {
    generateToken,
    verifyToken,
    extractToken,
    refreshToken,
    getTokenInfo,
};
//# sourceMappingURL=auth.js.map