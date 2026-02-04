// 📁 server/src/routes/interview.ts (SQLite/PostgreSQL両対応版)
// interview-session のセッション保存・復元を管理するエンドポイント
// save-all エンドポイント含む完全版
// 【修正】NOW() → CURRENT_TIMESTAMP（SQLite/PostgreSQL両対応）

import { Router, Request, Response } from 'express';
import { queryRow, queryAll, queryRun } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

// ✅ 認証チェック（utils/auth の verifyToken を使用）
const checkAuth = (req: Request, res: Response, next: Function) => {
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
  (req as any).userId = decoded.userId;
  (req as any).token = token;
  next();
};

// ============================================
// ✅ POST /api/interview/save - セッション保存
// ============================================
// タイムスタンプ競合解決版
router.post('/save', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { 
      currentQuestionIndex, 
      conversation, 
      answersWithPhotos, 
      timestamp,
      eventTitle,
      eventYear,
      eventMonth,
      eventDescription
    } = req.body;

    if (!userId) {
      console.error('❌ user_id なし');
      return res.status(400).json({ error: 'user_id is required' });
    }

    // タイムスタンプの有効性を確認
    const validTimestamp = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();

    console.log('💾 [Save] セッション保存開始:', {
      userId,
      currentQuestionIndex,
      answersCount: answersWithPhotos?.length || 0,
      eventTitle,
      timestamp: new Date(validTimestamp).toISOString()
    });

    // ✅ 既存データを取得
    const existing = await queryRow(
      'SELECT timestamp FROM interview_sessions WHERE user_id = ?',
      [userId]
    ) as any;

    // ✅ タイムスタンプ比較：新しいデータのみ保存
    if (existing && existing.timestamp > validTimestamp) {
      console.log('⚠️ [Save] 古いデータのため保存をスキップ:', {
        userId,
        existingTimestamp: new Date(existing.timestamp).toISOString(),
        newTimestamp: new Date(validTimestamp).toISOString()
      });
      return res.json({
        success: false,
        message: 'Data is older than existing - skipped',
        reason: 'timestamp_conflict'
      });
    }

    // ✅ JSON化
    const conversationJson = JSON.stringify(conversation);
    const answersJson = JSON.stringify(answersWithPhotos);

    // ✅ 新しいデータなので保存（PostgreSQL UPSERT / SQLite REPLACE）
    const result = await queryRun(
      `INSERT INTO interview_sessions 
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
      RETURNING id, user_id`,
      [
        userId,
        currentQuestionIndex,
        conversationJson,
        answersJson,
        eventTitle || null,
        eventYear || null,
        eventMonth || null,
        eventDescription || null,
        validTimestamp
      ]
    );

    console.log('✅ [Save] セッション保存完了:', {
      userId,
      currentQuestionIndex,
      answersCount: answersWithPhotos.length,
      eventTitle,
      timestamp: new Date(validTimestamp).toISOString()
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

  } catch (error) {
    console.error('❌ [Error] セッション保存エラー:', error);
    res.status(500).json({
      error: 'Failed to save session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// ✅ GET /api/interview/load - セッション復元
// ============================================
router.get('/load', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(400).json({ error: 'user_id not found in token' });
    }

    console.log('📖 [Load] セッション復元開始:', { userId });

    const session = await queryRow(
      `SELECT 
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
      WHERE user_id = ?`,
      [userId]
    ) as any;

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
        updatedAt: parsedSession.updatedAt
      });

      res.json({
        success: true,
        data: parsedSession
      });

    } catch (parseError) {
      console.error('❌ [Parse Error] JSON パース失敗:', parseError);
      res.status(500).json({
        error: 'Failed to parse session data',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('❌ [Error] セッション復元エラー:', error);
    res.status(500).json({
      error: 'Failed to load session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// ✅ GET /api/interview/info - セッション情報取得
// ============================================
router.get('/info', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    console.log('ℹ️ [Info] セッション情報取得:', { userId });

    const session = await queryRow(
      `SELECT 
        id,
        user_id,
        current_question_index,
        event_title,
        event_year,
        event_month,
        timestamp,
        created_at,
        updated_at
      FROM interview_sessions
      WHERE user_id = ?`,
      [userId]
    ) as any;

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        userId: session.user_id,
        currentQuestionIndex: session.current_question_index,
        eventTitle: session.event_title,
        eventYear: session.event_year,
        eventMonth: session.event_month,
        timestamp: new Date(session.timestamp).toISOString(),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        age: Math.floor((Date.now() - new Date(session.timestamp).getTime()) / 1000) + 's'
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

// ============================================
// ✅ DELETE /api/interview - セッション削除
// ============================================
router.delete('/', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    console.log('🗑️ [Delete] セッション削除:', { userId });

    await queryRun(
      'DELETE FROM interview_sessions WHERE user_id = ?',
      [userId]
    );

    console.log('✅ セッション削除完了');
    res.json({ 
      success: true, 
      message: 'Interview session deleted' 
    });
  } catch (error) {
    console.error('❌ [Error] セッション削除エラー:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// ✅ 【重要】POST /api/interview/save-all - 全データ一括保存
// ============================================
// CorrectionPageV2 からの統合エンドポイント
// 回答 + 出来事 + 修正テキスト + 写真を一括で保存
router.post('/save-all', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      answers,           // Answer[] - 修正済みの回答
      event_info,       // EventInfo - 出来事情報
      corrected_text,   // string - AI修正済みテキスト
      photo_paths,      // string[] - アップロード済み写真パス
      timestamp
    } = req.body;

    if (!userId) {
      console.error('❌ user_id なし');
      return res.status(400).json({ error: 'user_id is required' });
    }

    // タイムスタンプの有効性を確認
    const validTimestamp = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();

    console.log('💾 [save-all] 全データ一括保存開始:', {
      userId,
      answersCount: answers?.length || 0,
      eventTitle: event_info?.title,
      eventYear: event_info?.year,
      hasCorrectedText: !!corrected_text,
      photoCount: photo_paths?.length || 0,
      timestamp: new Date(validTimestamp).toISOString()
    });

    // ============================================
    // ステップ1：ユーザーの生年情報を取得
    // ============================================
    const userRecord = await queryRow(
      'SELECT birth_year FROM users WHERE id = ?',
      [userId]
    ) as any;
    
    if (!userRecord) {
      console.error('❌ ユーザーが見つかりません:', userId);
      return res.status(400).json({ error: 'User not found' });
    }

    let eventYear: number | null = null;
    let eventAge: number | null = null;

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
    const timelineResult = await queryRun(
      `INSERT INTO timeline (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [
        userId,
        eventAge || null,           // age
        eventYear || null,          // year
        event_info?.month || null,  // month
        event_info?.title || '（タイトル未設定）',  // event_title
        eventDescription || null,   // event_description
        corrected_text || null,     // edited_content（修正済みテキスト）
        corrected_text || null,     // ai_corrected_text
        'interview',                // stage
        false                       // is_auto_generated（ユーザー手動編集）
      ]
    ) as any;

    const timelineId = timelineResult[0]?.id;
    
    if (!timelineId) {
      throw new Error('Failed to create timeline entry');
    }

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
      for (let idx = 0; idx < photo_paths.length; idx++) {
        const photoPath = photo_paths[idx];
        
        console.log('📸 写真を紐付け中:', {
          timelineId,
          photoPath,
          order: idx
        });

        await queryRun(
          `INSERT INTO timeline_photos (
            timeline_id,
            file_path,
            description,
            display_order,
            created_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            timelineId,
            photoPath,
            `出来事「${event_info?.title || 'タイトル未設定'}」の写真 #${idx + 1}`,
            idx
          ]
        );
        linkedPhotoCount++;
      }

      console.log('✅ 写真を紐付け完了:', {
        timelineId,
        photoCount: linkedPhotoCount
      });
    }

    // ============================================
    // ステップ5：interview_sessions も更新（UPSERT）
    // ============================================
    try {
      // answersWithPhotos 形式に変換
      const answersWithPhotos = answers?.map((a: any, idx: number) => ({
        question: a.question,
        answer: a.answer,
        photos: a.photos || []
      })) || [];

      // current_question_indexを計算（答えた質問の数）
      const currentQuestionIndex = answersWithPhotos.length;

      await queryRun(
        `INSERT INTO interview_sessions 
          (user_id, current_question_index, conversation, answers_with_photos, event_title, event_year, event_month, event_description, timestamp, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          current_question_index = excluded.current_question_index,
          conversation = excluded.conversation,
          answers_with_photos = excluded.answers_with_photos,
          event_title = excluded.event_title,
          event_year = excluded.event_year,
          event_month = excluded.event_month,
          event_description = excluded.event_description,
          timestamp = excluded.timestamp,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          currentQuestionIndex,
          JSON.stringify([]),  // conversation（空配列）
          JSON.stringify(answersWithPhotos),
          event_info?.title || null,
          eventYear || null,
          event_info?.month || null,
          eventDescription || null,
          validTimestamp
        ]
      );

      console.log('✅ Interview session を保存:', {
        userId,
        currentQuestionIndex,
        answersCount: answersWithPhotos.length
      });
    } catch (sessionError: any) {
      console.error('❌ Interview session 保存エラー:', sessionError);
      throw new Error(`Interview session保存に失敗: ${sessionError.message}`);
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

  } catch (error: any) {
    console.error('❌ save-all エラー:', error);
    res.status(500).json({
      error: 'Failed to save data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;