/**
 * パスワードをハッシュ化
 */
export declare const hashPassword: (password: string) => Promise<string>;
/**
 * パスワードを検証
 */
export declare const verifyPassword: (password: string, hash: string) => Promise<boolean>;
/**
 * JWTトークンを生成
 */
export declare const generateToken: (userId: number, email: string) => string;
/**
 * JWTトークンを検証
 */
export declare const verifyToken: (token: string) => {
    userId: number;
    email: string;
} | null;
/**
 * Bearer トークンをヘッダーから抽出
 */
export declare const extractToken: (authHeader: string | undefined) => string | null;
//# sourceMappingURL=auth.d.ts.map