/**
 * JWTトークンを生成
 * @param userId ユーザーID
 * @param name ユーザー名（オプション）
 * @returns JWTトークン
 */
export declare function generateToken(userId: number, name?: string): string;
/**
 * JWTトークンを検証
 * @param token JWTトークン
 * @returns デコードされたペイロード（検証失敗時は null）
 */
export declare function verifyToken(token: string): {
    userId: number;
    name: string;
    iat: number;
} | null;
/**
 * Authorization ヘッダーからトークンを抽出
 * 形式: "Bearer <token>"
 * @param authHeader Authorization ヘッダー
 * @returns トークン（ない場合は null）
 */
export declare function extractToken(authHeader: string | undefined): string | null;
/**
 * 有効期限内のトークンを更新
 * @param oldToken 古いトークン
 * @returns 新しいトークン（失敗時は null）
 */
export declare function refreshToken(oldToken: string): string | null;
/**
 * トークンの情報を取得（デバッグ用）
 * @param token JWTトークン
 * @returns トークン情報
 */
export declare function getTokenInfo(token: string): {
    userId: number;
    name: string;
    expiresIn?: string;
} | null;
declare const _default: {
    generateToken: typeof generateToken;
    verifyToken: typeof verifyToken;
    extractToken: typeof extractToken;
    refreshToken: typeof refreshToken;
    getTokenInfo: typeof getTokenInfo;
};
export default _default;
//# sourceMappingURL=auth.d.ts.map