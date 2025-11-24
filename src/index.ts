import './db.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ルートのインポート
import userRoutes from './routes/users.js';
import photoRoutes from './routes/photos.js';
import responseRoutes from './routes/responses.js';
import aiRoutes from './routes/ai.js';
//import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
import publisherRoutes from './routes/publisher.js';
import interviewRoutes from './routes/interview.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// ミドルウェア
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS設定
app.use(cors());

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
// キャッチオール：全てのルートをindex.htmlに向ける

app.get('*', (req: Request, res: Response) => {
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
