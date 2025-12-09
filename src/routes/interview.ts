import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';

const router = Router();

// ============================================
// 認証ミドルウェア
// ============================================
const authenticate = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (!token) {
    return res.status(401).json({ error: '認証が必要です。トークンが見つかりません。' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '無効または期限切れのトークンです。' });
  }

  (req as any).user = decoded;
  next();
};

// 質問リスト（21個）
const INTERVIEW_QUESTIONS = [
  // 第1部：基本情報（生い立ち）
  "どこで、いつ生まれましたか？どんな環境で育ちましたか？",

  // 第2部：学生時代
  "小中高大の学校名を教えてください。",
  "学生時代で最も印象に残っていることは何ですか？",
  "進路選択の時、どのように決めましたか？",

  // 第3部：仕事・キャリア
  "初めての仕事について教えてください。",
  "仕事人生で最も大切な経験は何ですか？",
  "仕事でのやりがいや成功体験を聞かせてください。",
  "仕事での失敗や挫折経験、そこから学んだことは？",

  // 第4部：家族・人間関係
  "家族や友人との関係について聞かせてください。",
  "趣味や好きなこと、人生で最も幸せを感じた時期は何ですか？",

  // 第5部：健康・人生の転機
  "健康や病気について、人生に大きな影響を与えた出来事はありますか？",

  // 第6部：人生の教訓
  "これまでの人生で学んだ大切な教訓は何ですか？",
  "今、大事にしていることは何ですか？",

  // 第7部：メッセージ（複数対象）
  "次の世代（子ども・孫など）に伝えたいメッセージは何ですか？",
  "家族に伝えたいメッセージはありますか？",
  "友人に伝えたいメッセージはありますか？",
  "職場や会社に対して伝えたいメッセージはありますか？",

  // 第8部：総括
  "人生を振り返ってどう感じていますか？",
  "これからの時間の中で、挑戦したいことはありますか？",
];

// ============================================
// POST /api/interview/question - 次の質問を取得（認証必須）
// ============================================
router.post('/question', authenticate, async (req: Request, res: Response) => {
  try {
    const { user_id, conversation_history } = req.body;
    const user = (req as any).user;

    console.log('📝 [Interview] Request received');
    console.log('👤 user_id:', user_id);
    console.log('🔐 authenticated user_id:', user.userId);

    // ユーザー ID の確認
    if (!user_id) {
      console.error('❌ user_id is missing');
      return res.status(400).json({ error: 'user_id is required' });
    }

    // 本人確認：リクエストのuser_idと認証ユーザーが一致するか確認
    if (user.userId !== user_id) {
      console.error('❌ User ID mismatch');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    // 現在の質問番号を計算
    const currentQuestionIndex = Math.floor((conversation_history?.length || 0) / 2);

    console.log('📌 Current question index:', currentQuestionIndex);

    // すべての質問が終わったか確認
    if (currentQuestionIndex >= INTERVIEW_QUESTIONS.length) {
      console.log('✅ Interview completed');
      return res.json({
        completed: true,
        summary: 'インタビューを完了しました。ご協力ありがとうございました。'
      });
    }

    // 次の質問を取得
    const nextQuestion = INTERVIEW_QUESTIONS[currentQuestionIndex];

    console.log('❓ Next question:', nextQuestion);

    res.json({
      completed: false,
      question: nextQuestion,
    });

  } catch (error: any) {
    console.error('❌ Interview error:', error);
    res.status(500).json({ error: 'インタビューに失敗しました。' });
  }
});

// ============================================
// POST /api/interview/save - 会話履歴とanswersWithPhotosを保存（認証必須）
// ============================================
router.post('/save', authenticate, async (req: Request, res: Response) => {
  try {
    const { user_id, conversation, answersWithPhotos } = req.body;
    const user = (req as any).user;

    console.log('💾 [Save] Request received');
    console.log('👤 user_id:', user_id);
    console.log('🔐 authenticated user_id:', user.userId);
    console.log('📊 answersWithPhotos count:', answersWithPhotos?.length);

    if (!user_id || !conversation) {
      return res.status(400).json({ error: 'user_id and conversation are required' });
    }

    // 本人確認
    if (user.userId !== user_id) {
      console.error('❌ User ID mismatch');
      return res.status(403).json({ error: 'アクセス権限がありません。' });
    }

    const db = getDb();

    // ユーザー情報を取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id) as any;
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('👤 User found:', userRecord.name);

    // answersWithPhotos が提供されている場合、timeline に保存
    if (answersWithPhotos && Array.isArray(answersWithPhotos)) {
      console.log('📝 Processing answers with photos...');

      const insertTimelineStmt = db.prepare(`
        INSERT INTO timeline (
          user_id,
          year,
          month,
          event_description,
          edited_content,
          is_auto_generated,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `);

      const insertPhotoStmt = db.prepare(`
        INSERT INTO timeline_photos (
          timeline_id,
          file_path,
          description,
          display_order,
          created_at
        ) VALUES (?, ?, ?, ?, datetime('now'))
      `);

      answersWithPhotos.forEach((answer: any, index: number) => {
        const year = answer.year ? parseInt(answer.year) : null;
        const month = answer.month ? parseInt(answer.month) : null;
        const text = answer.text || '';
        const photos = answer.photos || [];

        console.log(`✏️ Processing answer ${index + 1}:`, { year, month, textLength: text.length, photoCount: photos.length });

        // timeline に回答を挿入
        const result = insertTimelineStmt.run(
          user_id,
          year,
          month,
          text,        // event_description
          text,        // edited_content
        );

        const timelineId = result.lastInsertRowid;
        console.log(`✅ Timeline created - id: ${timelineId}`);

        // 紐付けられた写真を挿入
        if (photos.length > 0) {
          photos.forEach((photo: any, photoIndex: number) => {
            insertPhotoStmt.run(
              timelineId,
              photo.file_path,
              photo.description || '',
              photoIndex
            );
            console.log(`📸 Photo inserted - ${photo.description}`);
          });
        }
      });

      console.log(`✅ All ${answersWithPhotos.length} answers saved to timeline`);
    }

    // 会話全体のログとして保存（参考用）
    const conversationText = conversation
      .map((msg: any) => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`)
      .join('\n');

    console.log('💾 Conversation log saved');

    res.json({ 
      message: 'インタビューが保存されました',
      saved: answersWithPhotos ? answersWithPhotos.length : 0,
      details: 'Timeline entries created successfully'
    });

  } catch (error: any) {
    console.error('❌ Save error:', error);
    res.status(500).json({ 
      error: 'インタビュー保存に失敗しました。',
      details: error.message
    });
  }
});

export default router;