import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';  // ← コメント外す
import { initDb, getDb } from './db.js';  // ← コメント外す

// ルートインポート
import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
// import photoRoutes from './routes/photo.js';  // ← コメントアウト
// import interviewRoutes from './routes/interview.js';  // ← コメントアウト

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ===== ミドルウェア設定 =====
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://robostudy.jp',
    'https://jibunshi-generator-frontend.vercel.app'
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ===== 静的ファイル設定 =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));

// ===== データベース初期化 =====
try {
  initDb();
  console.log('✅ Database initialized');
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}

// ===== ヘルスチェック =====
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== API ルート設定 =====

// PDFルート（新規追加）
app.use('/api/pdf', pdfRoutes);

// その他のルート
app.use('/api/timeline', timelineRoutes);
// app.use('/api/photo', photoRoutes);  // ← コメントアウト
// app.use('/api/interview', interviewRoutes);  // ← コメントアウト

// ===== ルートエンドポイント =====
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '自分史生成システム バックエンド API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      pdf: {
        generate: 'POST /api/pdf/generate',
        download: 'GET /api/pdf/:pdfId/download'
      },
      timeline: {
        create: 'POST /api/timeline',
        get: 'GET /api/timeline/:id',
        update: 'PUT /api/timeline/:id',
        list: 'GET /api/timeline/user/:userId'
      },
      photo: {
        upload: 'POST /api/photo/upload',
        get: 'GET /api/photo/:id',
        delete: 'DELETE /api/photo/:id'
      },
      interview: {
        create: 'POST /api/interview',
        list: 'GET /api/interview/user/:userId'
      }
    }
  });
});

// ===== エラーハンドリング =====
app.use((err: any, req: Request, res: Response) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// ===== 404ハンドリング =====
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// ===== サーバー起動 =====
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 自分史生成システム バックエンド    ║
║   ポート: ${PORT}                          ║
║   環境: ${process.env.NODE_ENV || 'development'}                 ║
╚════════════════════════════════════════╝
  `);
  console.log(`✅ サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📚 API ドキュメント: GET http://localhost:${PORT}/`);
});

// ===== グレースフルシャットダウン =====
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
//import { fileURLToPath } from 'url';
//import { initDb, getDb } from './db.js';

// ルートインポート
import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
//import photoRoutes from './routes/photo.js';
//import interviewRoutes from './routes/interview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ===== ミドルウェア設定 =====
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://robostudy.jp',
    'https://jibunshi-generator-frontend.vercel.app'
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ===== 静的ファイル設定 =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));

// ===== データベース初期化 =====
try {
  initDb();
  console.log('✅ Database initialized');
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}

// ===== ヘルスチェック =====
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== API ルート設定 =====

// PDFルート（新規追加）
app.use('/api/pdf', pdfRoutes);

// その他のルート
app.use('/api/timeline', timelineRoutes);
app.use('/api/photo', photoRoutes);
app.use('/api/interview', interviewRoutes);

// ===== ルートエンドポイント =====
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '自分史生成システム バックエンド API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      pdf: {
        generate: 'POST /api/pdf/generate',
        download: 'GET /api/pdf/:pdfId/download'
      },
      timeline: {
        create: 'POST /api/timeline',
        get: 'GET /api/timeline/:id',
        update: 'PUT /api/timeline/:id',
        list: 'GET /api/timeline/user/:userId'
      },
      photo: {
        upload: 'POST /api/photo/upload',
        get: 'GET /api/photo/:id',
        delete: 'DELETE /api/photo/:id'
      },
      interview: {
        create: 'POST /api/interview',
        list: 'GET /api/interview/user/:userId'
      }
    }
  });
});

// ===== エラーハンドリング =====
app.use((err: any, req: Request, res: Response) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// ===== 404ハンドリング =====
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// ===== サーバー起動 =====
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 自分史生成システム バックエンド    ║
║   ポート: ${PORT}                          ║
║   環境: ${process.env.NODE_ENV || 'development'}                 ║
╚════════════════════════════════════════╝
  `);
  console.log(`✅ サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📚 API ドキュメント: GET http://localhost:${PORT}/`);
});

// ===== グレースフルシャットダウン =====
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
