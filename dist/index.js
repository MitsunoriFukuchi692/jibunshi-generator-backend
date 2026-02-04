import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from './db.js';
import dotenv from 'dotenv';
dotenv.config();
import aiRoutes from './routes/ai.js';
import biographyRoutes from './routes/biography.js';
import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
import usersRoutes from './routes/users.js';
import photosRoutes from './routes/photos.js';
import cleanupRoutes from './routes/cleanup.js';
import interviewRoutes from './routes/interview.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
// ===== ミドルウェア設定 =====
app.use(cors({
    origin: '*', // すべてのオリジンを許可（テスト用）
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// ===== 静的ファイル設定 =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));
// ===== データベース初期化（非同期） =====
async function startServer() {
    try {
        await initDb();
        console.log('✅ Database initialized');
    }
    catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
    // ===== ヘルスチェック =====
    app.get('/health', (req, res) => {
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
    app.use('/api/interview', interviewRoutes);
    // DEBUG: テーブル初期化エンドポイント（404ハンドラーより前に定義）
    app.get('/api/init-db', async (req, res) => {
        try {
            await initDb();
            res.json({ message: 'Database initialized successfully' });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // ===== ルートエンドポイント =====
    app.get('/', (req, res) => {
        res.json({
            message: '自分史生成システム バックエンド API',
            version: '1.0.0',
            database: 'PostgreSQL (Supabase)',
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
                    deleteOldData: 'DELETE /api/cleanup/old-data' // ✅ 新: 過去データ削除
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
                    save: 'POST /api/interview/save',
                    load: 'GET /api/interview/load',
                    info: 'GET /api/interview/info',
                    delete: 'DELETE /api/interview'
                }
            }
        });
    });
    // ===== エラーハンドリング =====
    app.use((err, req, res, next) => {
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
    app.use((req, res) => {
        res.status(404).json({
            error: 'Not Found',
            path: req.path
        });
    });
    // ===== サーバー起動 =====
    const server = app.listen(PORT, () => {
        console.log(`
╔═════════════════════════════════════════╗
║   🚀 自分史生成システム バックエンド    ║
║   ポート: ${PORT}                          ║
║   環境: ${process.env.NODE_ENV || 'development'}                 ║
║   DB: PostgreSQL (Supabase)            ║
╚═════════════════════════════════════════╝
    `);
        console.log(`✅ サーバーが起動しました: http://localhost:${PORT}`);
        console.log(`📚 API ドキュメント: GET http://localhost:${PORT}/`);
    });
    // ===== グレースフルシャットダウン =====
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        server.close(async () => {
            await closeDb();
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        server.close(async () => {
            await closeDb();
            process.exit(0);
        });
    });
}
// サーバー起動
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
export default app;
//# sourceMappingURL=index.js.map