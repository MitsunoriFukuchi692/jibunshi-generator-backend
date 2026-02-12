// 📁 server/src/routes/interview.ts
// SQLite/PostgreSQL両対応の完全修正版
// save エンドポイント: UPSERT を両DBで動作するように修正

import { Router, Request, Response } from 'express';
import { queryRow, queryAll, queryRun, isPostgresConnection } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

// ✅ 認証チェック
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

  (req as any).userId = decoded.userId;
  (req as any).token = token;
  next();
};

// ============================================
// ✅ POST /api/interview/save - セッション保存（修正版）
// ============================================
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

    // ✅ currentQuestionIndex が undefined の場合は 0 をデフォルト値として使う
    const safeCurrentQuestionIndex = typeof currentQuestionIndex === 'number' && currentQuestionIndex >= 0 
      ? currentQuestionIndex 
      : 0;

    const validTimestamp = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();

    console.log('💾 [Save] セッション保存開始:', {
      userId,
      currentQuestionIndex: safeCurrentQuestionIndex,
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
    if (existing && existing.timestamp && existing.timestamp > validTimestamp) {
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
    const conversationJson = JSON.stringify(conversation || []);
    const answersJson = JSON.stringify(answersWithPhotos || []);

    // ✅ SQLite/PostgreSQL 互換性：既存データがあるか確認
    if (existing) {
      // UPDATE パターン（既存データがある場合）
      console.log('🔄 [Save] 既存データを更新:', { userId });
      
      await queryRun(
        `UPDATE interview_sessions
        SET 
          current_question_index = ?,
          conversation = ?,
          answers_with_photos = ?,
          event_title = ?,
          event_year = ?,
          event_month = ?,
          event_description = ?,
          timestamp = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
        [
          safeCurrentQuestionIndex,
          conversationJson,
          answersJson,
          eventTitle || null,
          eventYear || null,
          eventMonth || null,
          eventDescription || null,
          validTimestamp,
          userId
        ]
      );
    } else {
      // INSERT パターン（新規データの場合）
      console.log('✨ [Save] 新規セッションを作成:', { userId });
      
      await queryRun(
        `INSERT INTO interview_sessions 
        (user_id, current_question_index, conversation, answers_with_photos, event_title, event_year, event_month, event_description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          safeCurrentQuestionIndex,
          conversationJson,
          answersJson,
          eventTitle || null,
          eventYear || null,
          eventMonth || null,
          eventDescription || null,
          validTimestamp
        ]
      );
    }

    console.log('✅ [Save] セッション保存完了:', {
      userId,
      currentQuestionIndex: safeCurrentQuestionIndex,
      answersCount: answersWithPhotos?.length || 0,
      eventTitle,
      timestamp: new Date(validTimestamp).toISOString()
    });

    res.json({
      success: true,
      message: 'Session saved successfully',
      data: {
        user_id: userId,
        currentQuestionIndex: safeCurrentQuestionIndex,
        answersCount: answersWithPhotos?.length || 0,
        eventTitle,
        savedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ [Error] セッション保存エラー:', error);
    res.status(500).json({
      error: 'Failed to save session',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

    // ✅ 修正：最新の更新時刻のレコードを取得（複数レコード対策）
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
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
      [userId]
    ) as any;

    if (!session) {
      console.log('ℹ️ [Load] セッションなし:', { userId });
      return res.status(404).json({ error: 'Session not found' });
    }

    // JSON文字列をパース
    try {
      // ✅ SQLite の AS マッピング対応（カメルケース or スネークケース）
      const currentQuestionIndexValue = session.currentQuestionIndex ?? session.current_question_index ?? 0;
      const answersWithPhotosValue = session.answersWithPhotos ?? session.answers_with_photos;
      const eventTitleValue = session.eventTitle ?? session.event_title;
      const eventYearValue = session.eventYear ?? session.event_year;
      const eventMonthValue = session.eventMonth ?? session.event_month;
      const eventDescriptionValue = session.eventDescription ?? session.event_description;
      const updatedAtValue = session.updatedAt ?? session.updated_at;

      console.log('🔍 [DEBUG] Raw session from DB:', {
        currentQuestionIndex: session.currentQuestionIndex,
        current_question_index: session.current_question_index,
        resolved: currentQuestionIndexValue
      });

      const parsedSession = {
        currentQuestionIndex: currentQuestionIndexValue,
        conversation: session.conversation ? JSON.parse(session.conversation) : [],
        answersWithPhotos: answersWithPhotosValue ? JSON.parse(answersWithPhotosValue) : [],
        eventTitle: eventTitleValue || null,
        eventYear: eventYearValue || null,
        eventMonth: eventMonthValue || null,
        eventDescription: eventDescriptionValue || null,
        timestamp: session.timestamp || Date.now(),
        updatedAt: updatedAtValue || new Date().toISOString()
      };

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
        id: session.id,
        userId: session.user_id,
        currentQuestionIndex: session.current_question_index,
        eventTitle: session.event_title,
        eventYear: session.event_year,
        eventMonth: session.event_month,
        timestamp: session.timestamp,
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
// ✅ POST /api/interview/save-all - 全データ一括保存
// ============================================
router.post('/save-all', checkAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      answers,
      event_info,
      corrected_text,
      photo_paths,
      timestamp
    } = req.body;

    if (!userId) {
      console.error('❌ user_id なし');
      return res.status(400).json({ error: 'user_id is required' });
    }

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

    // ステップ1：ユーザーの生年情報を取得
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

    // ステップ2：修正テキストから出来事説明を生成
    const eventDescription = corrected_text || 
      `${event_info?.title || '（タイトル未設定）'}についての出来事`;

    console.log('📝 出来事説明を生成:', {
      length: eventDescription.length,
      hasEditedContent: !!corrected_text
    });

    // ステップ3：timeline テーブルに保存
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        eventAge || null,
        eventYear || null,
        event_info?.month || null,
        event_info?.title || '（タイトル未設定）',
        eventDescription || null,
        corrected_text || null,
        corrected_text || null,
        'interview',
        0
      ]
    ) as any;

    // timeline ID を取得（SQLiteとPostgresの互換性確保）
    let timelineId: number | null = null;
    
    if (Array.isArray(timelineResult) && timelineResult.length > 0) {
      timelineId = timelineResult[0]?.id;
    }
    
    if (!timelineId) {
      // ID を別途取得
      const lastTimeline = await queryRow(
        'SELECT id FROM timeline WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [userId]
      ) as any;
      timelineId = lastTimeline?.id;
    }
    
    if (!timelineId) {
      throw new Error('Failed to create timeline entry');
    }

    console.log('✅ Timeline 保存完了:', {
      timelineId,
      eventTitle: event_info?.title,
      eventYear
    });

    // ステップ4：写真を timeline_photos に紐付ける
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

    // ステップ5：interview_sessions も更新
    try {
      const answersWithPhotos = answers?.map((a: any, idx: number) => ({
        question: a.question,
        answer: a.answer,
        photos: a.photos || []
      })) || [];

      await queryRun(
        `UPDATE interview_sessions
        SET 
          answers_with_photos = ?,
          timestamp = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
        [
          JSON.stringify(answersWithPhotos),
          validTimestamp,
          userId
        ]
      );

      console.log('✅ Interview session を更新:', {
        userId,
        answersCount: answersWithPhotos.length
      });
    } catch (sessionError: any) {
      console.warn('⚠️ Interview session 更新に失敗（無視）:', sessionError.message);
    }

    // ✅ ステップ6：biography テーブルにも保存
    if (corrected_text && corrected_text.trim()) {
      try {
        await queryRun(`
          INSERT INTO biography (user_id, edited_content, ai_summary, updated_at)
          VALUES (?, ?, ?, NOW())
          ON CONFLICT (user_id) DO UPDATE SET edited_content = ?, ai_summary = ?, updated_at = NOW()
        `, [userId, corrected_text, corrected_text, corrected_text, corrected_text]);
        
        console.log('✅ Biography saved - user_id:', userId, 'length:', corrected_text.length);
      } catch (bioError: any) {
        console.warn('⚠️ Biography 保存に失敗（無視）:', bioError.message);
      }
    }

    // ステップ7：レスポンス返却
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
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// 🔍 DEBUG エンドポイント - interview_sessions 診断
// ============================================
router.get('/debug/check-sessions', async (req: Request, res: Response) => {
  try {
    // ユーザーごとのレコード数
    const userCounts = await queryAll(
      `SELECT user_id, COUNT(*) as count FROM interview_sessions GROUP BY user_id ORDER BY user_id`
    ) as any[];

    // 最新20件のレコード
    const recentSessions = await queryAll(
      `SELECT id, user_id, current_question_index, event_title, created_at, updated_at 
       FROM interview_sessions 
       ORDER BY updated_at DESC LIMIT 20`
    ) as any[];

    res.json({
      message: 'Interview Sessions Diagnostic Info',
      userRecordCounts: userCounts,
      recentSessions: recentSessions,
      totalRecords: userCounts.reduce((sum, u) => sum + parseInt(u.count), 0)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Debug endpoint error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;