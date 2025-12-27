/**
 * バックエンド用セキュリティミドルウェア
 * - 入力値検証
 * - XSS対策（サニタイズ）
 * - レート制限
 * - CORS設定
 */
import { Request, Response, NextFunction } from 'express';
/**
 * レート制限ミドルウェア
 */
export declare const rateLimitMiddleware: (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * ログイン試行回数チェック（ブルートフォース対策）
 */
export declare const checkFailedLoginAttempts: (email: string) => boolean;
/**
 * ログイン失敗を記録
 */
export declare const recordFailedLogin: (email: string) => void;
/**
 * ログイン成功時に失敗カウントをリセット
 */
export declare const resetFailedLogin: (email: string) => void;
/**
 * メールアドレスの形式を検証
 */
export declare const validateEmail: (email: string) => {
    isValid: boolean;
    error?: string;
};
/**
 * パスワードの強度を検証
 */
export declare const validatePassword: (password: string) => {
    isValid: boolean;
    error?: string;
};
/**
 * 名前の妥当性を検証
 */
export declare const validateName: (name: string) => {
    isValid: boolean;
    error?: string;
};
/**
 * 年齢の妥当性を検証
 */
export declare const validateAge: (age: number) => {
    isValid: boolean;
    error?: string;
};
/**
 * 生年月日の妥当性を検証
 */
export declare const validateBirthDate: (dateString: string) => {
    isValid: boolean;
    error?: string;
};
/**
 * HTML特殊文字をエスケープ
 */
export declare const escapeHtml: (text: string) => string;
/**
 * 入力文字列をサニタイズ
 */
export declare const sanitizeInput: (input: string) => string;
/**
 * リクエストボディをサニタイズするミドルウェア
 */
export declare const sanitizeBodyMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 必須フィールドの検証
 */
export declare const validateRequiredFields: (requiredFields: string[]) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * ペイロードサイズチェック
 */
export declare const validatePayloadSize: (maxSize?: number) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * セキュリティヘッダーを設定するミドルウェア
 */
export declare const securityHeadersMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * グローバルエラーハンドラー
 */
export declare const errorHandler: (err: any, req: Request, res: Response, next: NextFunction) => void;
/**
 * リクエスト/レスポンスロギング
 */
export declare const loggingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * データを暗号化
 */
export declare const encryptData: (data: string) => string;
/**
 * データを復号化
 */
export declare const decryptData: (encryptedData: string) => string;
/**
 * ローカルストレージをクリア（開発用）
 */
export declare const clearRateLimits: () => void;
//# sourceMappingURL=securityMiddleware.d.ts.map