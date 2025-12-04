import './db.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env ファイルのパスを明示的に指定
const envPath = path.resolve(__dirname, '../.env');
console.log('🔍 Loading .env from:', envPath);
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.error('⚠️ dotenv error:', dotenvResult.error.message);
} else {
  console.log('✅ .env loaded successfully');
}

// デバッグ: 環境変数の確認
console.log('🔍 ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? `✅ Set (${process.env.ANTHROPIC_API_KEY.substring(0, 20)}...)` : '❌ Not set');
console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 PORT:', process.env.PORT);

// ルートのインポート
import userRoutes from './routes/users.js';
import photoRoutes from './routes/photos.js';
import responseRoutes from './routes/responses.js';
import aiRoutes from './routes/ai.js';
//import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
import publisherRoutes from './routes/publisher.js';
import interviewRoutes from './routes/interview.js';
import {
  rateLimitMiddleware,
  sanitizeBodyMiddleware,
  securityHeadersMiddleware,
  loggingMiddleware,
} from './middleware/securityMiddleware.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// ミドルウェア
// ============================================

// ログ出力
app.use(loggingMiddleware);

// セキュリティヘッダー
app.use(securityHeadersMiddleware);

// JSON パースと入力検証 - 本番環境用に100mbに設定
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(sanitizeBodyMiddleware);

// CORS設定
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://robostudy.jp',
    'https://robostudy.jp/jibunshi/',
    process.env.FRONTEND_URL || ''
  ].filter(Boolean),
  credentials: true,
  optionsSuccessStatus: 200,
}));

// レート制限
app.use(rateLimitMiddleware);

// 静的ファイル配信
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// ルート
// ============================================
app.use('/api/users', userRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/ai', aiRoutes);
//app.use('/api/pdf', pdfRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/publisher', publisherRoutes);
app.use('/api/interview', interviewRoutes);

// ============================================
// ヘルスチェック
// ============================================
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// SPA対応：Reactのビルド済みファイルを提供
// ============================================
app.use(express.static(path.join(__dirname, '../public')));

app.get('*', (req: Request, res: Response) => {
  // /api で始まるリクエストは404を返す
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// エラーハンドリング
// ============================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ============================================
// サーバー起動
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
