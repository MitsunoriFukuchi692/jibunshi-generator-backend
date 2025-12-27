import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import dotenv from 'dotenv';
dotenv.config();
// ============================================
// ルートのインポート
// ============================================
import aiRoutes from './routes/ai.js';
import pdfRoutes from './routes/pdf.js';
import timelineRoutes from './routes/timeline.js';
import usersRoutes from './routes/users.js';
import photosRoutes from './routes/photos.js';
import interviewsRouter from './routes/interviews.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
// ============================================
// CORS設定
// ============================================
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://robostudy.jp',
        'https://jibunshi-generator-frontend.vercel.app'
    ],
    credentials: true
}));
// ============================================
// ボディパーサー設定
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// ============================================
// 静的ファイル設定
// ============================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/pdfs', express.static(path.join(__dirname, '../pdfs')));
// ============================================
// データベース初期化
// ============================================
try {
    initDb();
    console.log('✅ Database initialized with new schema');
    console.log('   - biography テーブル（自分史物語）');
    console.log('   - timeline_metadata テーブル（人生年表）');
    console.log('   - biography_photos テーブル（写真）');
    console.log('   - interviews テーブル（インタビュー記録）');
}
catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
}
// ============================================
// ヘルスチェック
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ============================================
// API ルート設定
// ============================================
// ユーザー認証ルート
app.use('/api/users', usersRoutes);
// AI テキスト編集ルート
app.use('/api/ai', aiRoutes);
// PDF生成・ダウンロードルート
app.use('/api/pdf', pdfRoutes);
// 写真アップロード・管理ルート
app.use('/api/photos', photosRoutes);
// タイムライン・自分史・年表ルート（新構造対応）
app.use('/api/timeline', timelineRoutes);
// インタビュー記録ルート（新しい interviews テーブル対応）
app.use('/api/interviews', interviewsRouter);
// ============================================
// ルートエンドポイント（APIドキュメント）
// ============================================
app.get('/', (req, res) => {
    res.json({
        message: '自分史生成システム バックエンド API',
        version: '2.0.0',
        schema: 'New Schema (biography + timeline_metadata separated)',
        baseUrl: `http://localhost:${PORT}`,
        documentation: {
            health: 'GET /health - ヘルスチェック',
            root: 'GET / - このドキュメント'
        },
        endpoints: {
            users: {
                description: 'ユーザー認証・管理',
                routes: {
                    register: 'POST /api/users/register - ユーザー登録',
                    login: 'POST /api/users/login - ログイン',
                    profile: 'GET /api/users/profile - プロフィール取得'
                }
            },
            ai: {
                description: 'AI テキスト編集',
                routes: {
                    editText: 'POST /api/ai/edit-text - テキストを修正・編集'
                }
            },
            biography: {
                description: '自分史物語管理（AIで編集済みのテキスト + 写真）',
                schema: 'biography テーブル + biography_photos テーブル',
                routes: {
                    create: 'POST /api/timeline/biography - 自分史物語を作成/更新',
                    get: 'GET /api/timeline/biography - 自分史物語を取得（写真も含む）'
                },
                example_post: {
                    edited_content: 'AI編集済みのテキスト...',
                    ai_summary: '要約（オプション）',
                    answersWithPhotos: [
                        {
                            photos: [
                                { file_path: 'data:image/...', description: '思い出の写真' }
                            ]
                        }
                    ]
                },
                example_response: {
                    id: 1,
                    user_id: 1,
                    edited_content: '...',
                    photos: [
                        { id: 1, file_path: '...', description: '...', display_order: 0 }
                    ]
                }
            },
            timeline_metadata: {
                description: '人生年表管理（重要なイベント）',
                schema: 'timeline_metadata テーブル',
                routes: {
                    create: 'POST /api/timeline/metadata - 年表を作成/更新',
                    get: 'GET /api/timeline/metadata - 年表を取得'
                },
                example_post: {
                    important_events: [
                        { year: 1980, month: 5, eventTitle: '生まれる' },
                        { year: 2000, month: 4, eventTitle: '入学' },
                        { year: 2020, month: 10, eventTitle: 'キャリア変更' }
                    ]
                },
                example_response: {
                    id: 1,
                    user_id: 1,
                    important_events: [
                        { year: 1980, month: 5, eventTitle: '生まれる' }
                    ]
                }
            },
            pdf: {
                description: 'PDF生成・ダウンロード（biography + timeline_metadata を統合）',
                routes: {
                    generate: 'POST /api/pdf/generate - PDFを生成（要認証）',
                    download: 'GET /api/pdf/download/:filename - PDFをダウンロード（要認証）'
                },
                pdf_structure: {
                    page_1: '表紙（ユーザー名、年齢、作成日）',
                    page_2: '自分史物語（biography.edited_content）',
                    page_3: '思い出の写真（biography_photos）',
                    page_4: '人生年表（timeline_metadata.important_events）'
                },
                example_response: {
                    success: true,
                    filename: 'autobiography_1_1703410200000.pdf',
                    filepath: '/pdfs/autobiography_1_1703410200000.pdf'
                }
            },
            photos: {
                description: '写真アップロード・管理',
                routes: {
                    upload: 'POST /api/photos - 写真をアップロード',
                    get: 'GET /api/photos/:id - 写真情報を取得',
                    delete: 'DELETE /api/photos/:id - 写真を削除'
                }
            },
            interviews: {
                description: 'インタビュー記録管理（新しい interviews テーブル対応）',
                routes: {
                    create: 'POST /api/interviews - インタビュー記録を作成（複数件一括）',
                    list: 'GET /api/interviews - ユーザーのインタビュー一覧を取得',
                    delete: 'DELETE /api/interviews - インタビュー記録を削除'
                },
                example_post: {
                    interviews: [
                        {
                            question: 'どこで、いつ生まれましたか？',
                            answer_text: '1952年、東京都で生まれました。',
                            year: '1952',
                            month: null,
                            eventTitle: '誕生'
                        },
                        {
                            question: '小中高大の学校名を教えてください。',
                            answer_text: '東京大学文学部を卒業しました。',
                            year: '1971',
                            month: '4',
                            eventTitle: '大学入学'
                        }
                    ]
                },
                example_response: {
                    success: true,
                    data: {
                        count: 19,
                        userId: 1
                    }
                }
            }
        },
        database_schema: {
            tables: [
                {
                    name: 'users',
                    purpose: 'ユーザー基本情報',
                    unique_constraint: 'email'
                },
                {
                    name: 'interviews',
                    purpose: 'インタビュー記録（質問・回答）',
                    fields: ['user_id', 'question', 'answer_text', 'duration_seconds', 'is_processed'],
                    note: '複数件の質問・回答を個別に保存'
                },
                {
                    name: 'biography',
                    purpose: '自分史物語（AI最終編集版）',
                    key_field: 'edited_content',
                    unique_constraint: 'user_id（最大1レコード/ユーザー）'
                },
                {
                    name: 'biography_photos',
                    purpose: '自分史に紐付ける写真',
                    foreign_key: 'biography_id',
                    supports_multiple: true
                },
                {
                    name: 'timeline_metadata',
                    purpose: '人生年表（重要イベント）',
                    key_field: 'important_events (JSON)',
                    unique_constraint: 'user_id（最大1レコード/ユーザー）'
                },
                {
                    name: 'pdf_versions',
                    purpose: 'PDF生成履歴・版管理'
                }
            ]
        },
        data_flow: {
            step_1: 'InterviewPage: 19問の質問に回答',
            step_2: 'interviews テーブルに19件保存 (POST /api/interviews)',
            step_3: 'AIGenerationPage: interviews から取得してAI編集',
            step_4: 'biography テーブルに保存 (POST /api/timeline/biography)',
            step_5: 'TextCorrectionPage: biography から取得して手動修正',
            step_6: 'biography テーブルを更新 (POST /api/timeline/biography)',
            step_7: 'TurningPointPage: ターニングポイント入力',
            step_8: 'timeline_metadata テーブルに保存 (POST /api/timeline/metadata)',
            step_9: 'PDFDisplayPage: biography + timeline_metadata から PDF生成',
            step_10: 'PublisherPage: PDF管理・公開'
        },
        migration_notes: {
            version_1_0: 'timeline テーブル（混在構造）',
            version_2_0: 'biography + timeline_metadata（分離構造）✅ 現在',
            migration_history: [
                '2025-12-26: interviews テーブルを新規追加',
                '2025-12-26: biography / timeline_metadata / biography_photos に分離'
            ],
            breaking_changes: [
                'POST /api/timeline → POST /api/timeline/biography',
                'POST /api/timeline → POST /api/timeline/metadata',
                'timeline テーブルはDBから削除',
                'interview.js → interviews.ts に変更'
            ],
            backward_compatibility: 'なし（フロントエンド側でエンドポイント更新が必要）'
        },
        server_info: {
            environment: process.env.NODE_ENV || 'development',
            port: PORT,
            uptime_seconds: Math.floor(process.uptime()),
            node_version: process.version
        }
    });
});
// ============================================
// エラーハンドリング
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        timestamp: new Date().toISOString(),
        path: req.path
    });
});
// ============================================
// 404 ハンドリング
// ============================================
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        hint: 'Available endpoints: GET /'
    });
});
// ============================================
// サーバー起動
// ============================================
app.listen(PORT, () => {
    console.log(`
┌────────────────────────────────────────────────────────────────┐
│   🚀 自分史生成システム バックエンド                            │
│   Schema Version: 2.0 (New Structure)                           │
├────────────────────────────────────────────────────────────────┤
│   ポート: ${PORT}                                              │
│   環境: ${(process.env.NODE_ENV || 'development').padEnd(43)} │
│   ドキュメント: GET http://localhost:${PORT.toString().padEnd(20)} │
└────────────────────────────────────────────────────────────────┘

📊 新しいテーブル構造:
   ✅ interviews（インタビュー記録）
   ✅ biography（自分史物語）
   ✅ biography_photos（写真）
   ✅ timeline_metadata（人生年表）

📍 主要なエンドポイント:
   • POST /api/interviews - インタビュー記録を保存
   • POST /api/timeline/biography - 自分史物語を作成/更新
   • POST /api/timeline/metadata - 人生年表を作成/更新
   • POST /api/pdf/generate - PDFを生成（両方を統合）
   • GET / - API ドキュメント

✅ サーバーが起動しました: http://localhost:${PORT}
  `);
});
// ============================================
// グレースフルシャットダウン
// ============================================
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});
export default app;
//# sourceMappingURL=index.js.map