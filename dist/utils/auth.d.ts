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
/**
 * トークンをハッシュ化（データベース保存用）
 * @param token JWTトークン
 * @returns ハッシュ値
 */
export declare function hashToken(token: string): string;
/**
 * デバイスIDを生成（ユニーク識別子）
 * フロントエンドで生成して、ログイン時に送信される
 * @returns UUID形式のデバイスID
 */
export declare function generateDeviceId(): string;
/**
 * セッション有効期限を計算
 * @returns 有効期限の日時（7日後）
 */
export declare function calculateSessionExpiry(): Date;
declare const _default: {
    generateToken: typeof generateToken;
    verifyToken: typeof verifyToken;
    extractToken: typeof extractToken;
    refreshToken: typeof refreshToken;
    getTokenInfo: typeof getTokenInfo;
    hashToken: typeof hashToken;
    generateDeviceId: typeof generateDeviceId;
    calculateSessionExpiry: typeof calculateSessionExpiry;
};
export default _default;
//# sourceMappingURL=auth.d.ts.map