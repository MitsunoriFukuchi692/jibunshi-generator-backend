// 📁 server/src/routes/interview.ts
// interview-session のセッション保存・復元を管理するエンドポイント（改善版）
// 進行中データ編集対応版
import { Router } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';
const router = Router();
// ✅ 認証チェック（utils/auth の verifyToken を使用）
const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized: No token provided',
            message: 'Authorization header required'
        });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            error: 'Unauthorized: Invalid token',
            message: 'Token verification failed'
        });
    }
    // userId を request に設定
    req.userId = decoded.userId;
    req.token = token;
    next();
};
// ✅ テーブル初期化関数
const ensureTablesExist = (db) => {
    try {
        db.exec(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_question_index INTEGER DEFAULT 0,
        conversation TEXT DEFAULT '[]',
        answers_with_photos TEXT DEFAULT '[]',
        event_title TEXT,
        event_year INTEGER,
        event_month INTEGER,
        event_description TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
        // ✅ 既存テーブルに新しいカラムを追加（カラムが存在しない場合のみ）
        try {
            db.exec(`ALTER TABLE interview_sessions ADD COLUMN event_title TEXT`);
            console.log('✅ event_title カラム追加');
        }
        catch (e) {
            // カラムが既に存在する場合はスキップ
        }
        try {
            db.exec(`ALTER TABLE interview_sessions ADD COLUMN event_year INTEGER`);
            console.log('✅ event_year カラム追加');
        }
        catch (e) {
            // カラムが既に存在する場合はスキップ
        }
        try {
            db.exec(`ALTER TABLE interview_sessions ADD COLUMN event_month INTEGER`);
            console.log('✅ event_month カラム追加');
        }
        catch (e) {
            // カラムが既に存在する場合はスキップ
        }
        try {
            db.exec(`ALTER TABLE interview_sessions ADD COLUMN event_description TEXT`);
            console.log('✅ event_description カラム追加');
        }
        catch (e) {
            // カラムが既に存在する場合はスキップ
        }
        // ✅ インデックス作成（高速化）
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
    `);
        console.log('✅ interview_sessions テーブル確認完了');
    }
    catch (error) {
        console.error('❌ テーブル初期化エラー:', error);
        throw error;
    }
};
// ✅ セッション保存エンドポイント（改善版 - タイムスタンプ競合解決）
router.post('/save', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { currentQuestionIndex, conversation, answersWithPhotos, timestamp, eventTitle, eventYear, eventMonth, eventDescription } = req.body;
        if (!userId) {
            console.error('❌ user_id なし');
            return res.status(400).json({ error: 'user_id is required' });
        }
        const db = getDb();
        ensureTablesExist(db);
        console.log('💾 [Save] セッション保存開始:', {
            userId,
            currentQuestionIndex,
            answersCount: answersWithPhotos?.length || 0,
            eventTitle,
            timestamp: new Date(timestamp).toISOString()
        });
        // ✅ 既存データを取得
        const existing = db.prepare('SELECT timestamp FROM interview_sessions WHERE user_id = ?').get(userId);
        // ✅ タイムスタンプ比較：新しいデータのみ保存
        if (existing && existing.timestamp > timestamp) {
            console.log('⚠️ [Save] 古いデータのため保存をスキップ:', {
                userId,
                existingTimestamp: new Date(existing.timestamp).toISOString(),
                newTimestamp: new Date(timestamp).toISOString()
            });
            return res.json({
                success: false,
                message: 'Data is older than existing - skipped',
                reason: 'timestamp_conflict'
            });
        }
        // ✅ 新しいデータなので保存
        const statement = db.prepare(`
      INSERT INTO interview_sessions 
      (user_id, current_question_index, conversation, answers_with_photos, event_title, event_year, event_month, event_description, timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        current_question_index = excluded.current_question_index,
        conversation = excluded.conversation,
        answers_with_photos = excluded.answers_with_photos,
        event_title = excluded.event_title,
        event_year = excluded.event_year,
        event_month = excluded.event_month,
        event_description = excluded.event_description,
        timestamp = excluded.timestamp,
        updated_at = CURRENT_TIMESTAMP
    `);
        const conversationJson = JSON.stringify(conversation);
        const answersJson = JSON.stringify(answersWithPhotos);
        statement.run(userId, currentQuestionIndex, conversationJson, answersJson, eventTitle || null, eventYear || null, eventMonth || null, eventDescription || null, timestamp);
        console.log('✅ [Save] セッション保存完了:', {
            userId,
            currentQuestionIndex,
            answersCount: answersWithPhotos.length,
            eventTitle,
            timestamp: new Date(timestamp).toISOString()
        });
        res.json({
            success: true,
            message: 'Session saved successfully',
            data: {
                user_id: userId,
                currentQuestionIndex,
                answersCount: answersWithPhotos.length,
                eventTitle,
                savedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('❌ [Error] セッション保存エラー:', error);
        res.status(500).json({
            error: 'Failed to save session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ セッション復元エンドポイント
router.get('/load', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'user_id not found in token' });
        }
        const db = getDb();
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        console.log('📖 [Load] セッション復元開始:', { userId });
        const statement = db.prepare(`
      SELECT 
        current_question_index as currentQuestionIndex,
        conversation,
        answers_with_photos as answersWithPhotos,
        event_title as eventTitle,
        event_year as eventYear,
        event_month as eventMonth,
        event_description as eventDescription,
        timestamp,
        updated_at as updatedAt
      FROM interview_sessions
      WHERE user_id = ?
    `);
        const session = statement.get(userId);
        if (!session) {
            console.log('ℹ️ [Load] セッションなし:', { userId });
            return res.status(404).json({ error: 'Session not found' });
        }
        // JSON文字列をパース
        try {
            const parsedSession = {
                currentQuestionIndex: session.currentQuestionIndex,
                conversation: JSON.parse(session.conversation),
                answersWithPhotos: JSON.parse(session.answersWithPhotos),
                eventTitle: session.eventTitle,
                eventYear: session.eventYear,
                eventMonth: session.eventMonth,
                eventDescription: session.eventDescription,
                timestamp: session.timestamp,
                updatedAt: session.updatedAt
            };
            // ✅ データ整合性チェック
            console.log('✅ [Load] セッション復元成功:', {
                userId,
                currentQuestionIndex: parsedSession.currentQuestionIndex,
                conversationLength: parsedSession.conversation.length,
                answersCount: parsedSession.answersWithPhotos.length,
                eventTitle: parsedSession.eventTitle,
                updatedAt: parsedSession.updatedAt,
                age: Math.floor((Date.now() - session.timestamp) / 1000) + 's'
            });
            res.json(parsedSession);
        }
        catch (parseError) {
            console.error('❌ [Parse] JSONパースエラー:', parseError);
            return res.status(500).json({
                error: 'Failed to parse session data',
                details: parseError instanceof Error ? parseError.message : 'Unknown error'
            });
        }
    }
    catch (error) {
        console.error('❌ [Error] セッション復元エラー:', error);
        res.status(500).json({
            error: 'Failed to load session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ✅ セッション削除エンドポイント
router.delete('/', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'user_id not found in token' });
        }
        const db = getDb();
        // ✅ テーブル存在確認
        ensureTablesExist(db);
        const statement = db.prepare(`DELETE FROM interview_sessions WHERE user_id = ?`);
        const result = statement.run(userId);
        console.log('✅ [Delete] セッション削除完了:', {
            userId,
            deletedRows: result.changes || 0
        });
        res.json({
            success: true,
            message: 'Session deleted successfully',
            deletedRows: result.changes || 0
        });
    }
    catch (error) {
        console.error('❌ [Error] セッション削除エラー:', error);
        res.status(500).json({
            error: 'Failed to delete session',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// ========================================
// ❌ 【非推奨】GET /api/interview-session/info
// ========================================
// 【理由】メタデータのみを返すため、フロントエンドでセッション状態が不正確になる
// → /load エンドポイントを使用してください（実際のセッションデータを返す）
// ========================================
/*
// ✅ セッション情報取得エンドポイント
router.get('/info', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(400).json({ error: 'user_id not found in token' });
    }

    const db = getDb();

    // ✅ テーブル存在確認
    ensureTablesExist(db);

    const statement = db.prepare(`
      SELECT
        id,
        user_id,
        current_question_index,
        length(conversation) as conversation_size,
        length(answers_with_photos) as answers_size,
        event_title,
        event_year,
        event_month,
        timestamp,
        created_at,
        updated_at
      FROM interview_sessions
      WHERE user_id = ?
    `);

    const session = statement.get(userId) as any;

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        userId: session.user_id,
        currentQuestionIndex: session.current_question_index,
        conversationSize: session.conversation_size + ' bytes',
        answersSize: session.answers_size + ' bytes',
        eventTitle: session.event_title,
        eventYear: session.event_year,
        eventMonth: session.event_month,
        timestamp: new Date(session.timestamp).toISOString(),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        age: Math.floor((Date.now() - session.timestamp) / 1000) + 's'
      }
    });
  } catch (error) {
    console.error('❌ [Error] セッション情報取得エラー:', error);
    res.status(500).json({
      error: 'Failed to get session info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
*/
// ============================================
// ✅ 【新規追加】POST /api/interview/save-all - 全データ一括保存
// ============================================
// CorrectionPageV2 からの統合エンドポイント
// 回答 + 出来事 + 修正テキスト + 写真を一括で保存
router.post('/save-all', checkAuth, async (req, res) => {
    try {
        const userId = req.userId;
        const { answers, // Answer[] - 修正済みの回答
        event_info, // EventInfo - 出来事情報
        corrected_text, // string - AI修正済みテキスト
        photo_paths, // string[] - アップロード済み写真パス
        timestamp } = req.body;
        if (!userId) {
            console.error('❌ user_id なし');
            return res.status(400).json({ error: 'user_id is required' });
        }
        const db = getDb();
        console.log('💾 [save-all] 全データ一括保存開始:', {
            userId,
            answersCount: answers?.length || 0,
            eventTitle: event_info?.title,
            eventYear: event_info?.year,
            hasCorrectedText: !!corrected_text,
            photoCount: photo_paths?.length || 0,
            timestamp: new Date(timestamp).toISOString()
        });
        // ============================================
        // ステップ1：ユーザーの生年情報を取得
        // ============================================
        const userRecord = db.prepare('SELECT birth_year FROM users WHERE id = ?').get(userId);
        if (!userRecord) {
            console.error('❌ ユーザーが見つかりません:', userId);
            return res.status(400).json({ error: 'User not found' });
        }
        let eventYear = null;
        let eventAge = null;
        // event_info から年齢 or 西暦年を計算
        if (event_info?.year) {
            eventYear = event_info.year;
            if (eventYear && userRecord.birth_year) {
                eventAge = eventYear - userRecord.birth_year;
                console.log('✅ Event年を指定:', {
                    eventYear,
                    birthYear: userRecord.birth_year,
                    calculatedAge: eventAge
                });
            }
        }
        // ============================================
        // ステップ2：修正テキストから出来事説明を生成
        // ============================================
        const eventDescription = corrected_text ||
            `${event_info?.title || '（タイトル未設定）'}についての出来事`;
        console.log('📝 出来事説明を生成:', {
            length: eventDescription.length,
            hasEditedContent: !!corrected_text
        });
        // ============================================
        // ステップ3：timeline テーブルに保存
        // ============================================
        const timelineStmt = db.prepare(`
      INSERT INTO timeline (
        user_id,
        age,
        year,
        month,
        event_title,
        event_description,
        edited_content,
        ai_corrected_text,
        stage,
        is_auto_generated,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
        const timelineResult = timelineStmt.run(userId, eventAge || null, // age
        eventYear || null, // year
        event_info?.month || null, // month
        event_info?.title || '（タイトル未設定）', // event_title
        eventDescription || null, // event_description
        corrected_text || null, // edited_content（修正済みテキスト）
        corrected_text || null, // ai_corrected_text
        'interview', // stage
        0);
        const timelineId = timelineResult.lastInsertRowid;
        console.log('✅ Timeline 保存完了:', {
            timelineId,
            eventTitle: event_info?.title,
            eventYear
        });
        // ============================================
        // ステップ4：写真を timeline_photos に紐付ける
        // ============================================
        let linkedPhotoCount = 0;
        if (photo_paths && Array.isArray(photo_paths) && photo_paths.length > 0) {
            const photoStmt = db.prepare(`
        INSERT INTO timeline_photos (
          timeline_id,
          file_path,
          description,
          display_order,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);
            for (let idx = 0; idx < photo_paths.length; idx++) {
                const photoPath = photo_paths[idx];
                console.log('📸 写真を紐付け中:', {
                    timelineId,
                    photoPath,
                    order: idx
                });
                photoStmt.run(timelineId, photoPath, `出来事「${event_info?.title || 'タイトル未設定'}」の写真 #${idx + 1}`, idx);
                linkedPhotoCount++;
            }
            console.log('✅ 写真を紐付け完了:', {
                timelineId,
                photoCount: linkedPhotoCount
            });
        }
        // ============================================
        // ステップ5：interview_sessions も更新
        // ============================================
        try {
            const updateSessionStmt = db.prepare(`
        UPDATE interview_sessions
        SET 
          answers_with_photos = ?,
          timestamp = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `);
            // answersWithPhotos 形式に変換
            const answersWithPhotos = answers?.map((a, idx) => ({
                question: a.question,
                answer: a.answer,
                photos: a.photos || []
            })) || [];
            updateSessionStmt.run(JSON.stringify(answersWithPhotos), timestamp || Date.now(), userId);
            console.log('✅ Interview session を更新:', {
                userId,
                answersCount: answersWithPhotos.length
            });
        }
        catch (sessionError) {
            console.warn('⚠️ Interview session 更新に失敗（無視）:', sessionError.message);
        }
        // ============================================
        // ステップ6：レスポンス返却
        // ============================================
        console.log('✅ save-all 完了！');
        res.status(201).json({
            success: true,
            message: '全データが保存されました',
            data: {
                timelineId,
                userId,
                eventTitle: event_info?.title,
                eventYear,
                answersCount: answers?.length || 0,
                photoCount: linkedPhotoCount,
                correctedTextLength: corrected_text?.length || 0,
                savedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('❌ save-all エラー:', error);
        res.status(500).json({
            error: 'Failed to save data',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
export default router;
//# sourceMappingURL=Oldinterview.js.map