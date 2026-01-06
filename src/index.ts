import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

// ルートインポート
import aiRoutes from './routes/ai.js';
import biographyRoutes from './routes/biography.js';
import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
import usersRoutes from './routes/users.js';
import photosRoutes from './routes/photos.js';
import cleanupRoutes from './routes/cleanup.js';  // ✅ 新: cleanup ルート
// import photoRoutes from './routes/photo.js';
import interviewRoutes from './routes/interview.js';
import interviewSessionRoutes from './routes/interview-session.js';  // ✅ 新: interview-session ルート

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ===== ミドルウェア設定 =====
app.use(cors({
  origin: '*',  // すべてのオリジンを許可（テスト用）
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

// ユーザー認証ルート
app.use('/api/users', usersRoutes);
app.use('/api/biography', biographyRoutes);

// AI ルート（テキスト修正）
app.use('/api/ai', aiRoutes);

// PDFルート
app.use('/api/pdf', pdfRoutes);

// 写真ルート
app.use('/api/photos', photosRoutes);

// ✅ 新: クリーンアップルート（過去データ削除）
app.use('/api/cleanup', cleanupRoutes);

// その他のルート
app.use('/api/timeline', timelineRoutes);

// app.use('/api/photo', photoRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/interview-session', interviewSessionRoutes);  // ✅ 新: interview-session ルート

// ===== ルートエンドポイント =====
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '自分史生成システム バックエンド API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: {
        login: 'POST /api/users/login',
        register: 'POST /api/users/register'
      },
      ai: {
        editText: 'POST /api/ai/edit-text'
      },
      pdf: {
        generate: 'POST /api/pdf/generate',
        download: 'GET /api/pdf/:pdfId/download'
      },
      cleanup: {
        deleteOldData: 'DELETE /api/cleanup/old-data'  // ✅ 新: 過去データ削除
      },
      timeline: {
        create: 'POST /api/timeline',
        get: 'GET /api/timeline/:id',
        update: 'PUT /api/timeline/:id',
        list: 'GET /api/timeline/user/:userId',
        linkPhotos: 'POST /api/timeline/:timelineId/photos',
        getPhotos: 'GET /api/timeline/:timelineId/photos',
        unlinkPhoto: 'DELETE /api/timeline/:timelineId/photos/:photoId'
      },
      photo: {
        upload: 'POST /api/photo/upload',
        get: 'GET /api/photo/:id',
        delete: 'DELETE /api/photo/:id'
      },
      interview: {
        create: 'POST /api/interview',
        list: 'GET /api/interview/user/:userId',
        save: 'POST /api/interview/save'
      },
      interviewSession: {
        save: 'POST /api/interview-session/save',  // ✅ 新
        load: 'GET /api/interview-session/load',   // ✅ 新
        delete: 'DELETE /api/interview-session'    // ✅ 新
      }
    }
  });
});

// ===== エラーハンドリング =====
app.use((err: any, req: Request, res: Response, next: Function) => {
  console.error('❌ Error:', err);
  if (res.headersSent) {
    return next(err);
  }
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
╔═════════════════════════════════════════╗
║   🚀 自分史生成システム バックエンド    ║
║   ポート: ${PORT}                          ║
║   環境: ${process.env.NODE_ENV || 'development'}                 ║
╚═════════════════════════════════════════╝
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