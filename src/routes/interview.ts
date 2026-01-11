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

// ============================================
// POST /api/interview/save - インタビュー回答を保存
// 🔥 重大修正：19問のデータを interviews テーブルに実際に保存
// ============================================
router.post('/save', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.userId;
    const db = getDb();
    const { age, answersWithPhotos } = req.body;

    console.log('💾 [Save] Request received');
    console.log('👤 user_id:', userId);
    console.log('📊 answersWithPhotos type:', Array.isArray(answersWithPhotos) ? 'Array' : 'Not Array');
    console.log('📊 answersWithPhotos count:', answersWithPhotos?.length || 0);

    // ユーザー情報取得
    const userRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    console.log('👤 User found:', userRecord?.name);

    if (!userRecord) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // 🔥 重要修正：19問のデータを interviews テーブルに保存
    if (!answersWithPhotos || !Array.isArray(answersWithPhotos) || answersWithPhotos.length === 0) {
      console.warn('⚠️ No answers to save');
      return res.status(400).json({ 
        error: 'No answers provided',
        details: 'answersWithPhotos must be a non-empty array'
      });
    }

    // ✅ 質問リスト（19個）- InterviewPageと同じ
    const INTERVIEW_QUESTIONS = [
      "いつ、どこで生まれましたか？",
      "どんな環境で育ちましたか？",
      "小・中・高・大の学校名を覚えている範囲で教えてください。",
      "学生時代で最も印象に残っている先生や出来事は何ですか？",
      "進路選択の時、どのように決めましたか？",
      "初めての仕事はどんな仕事でしたか？",
      "仕事人生でやりがいや、最も大切な経験は何でしたか？",
      "仕事での失敗や挫折経験、そこから学んだことは？",
      "家族や友人との思いでについて聞かせてください。",
      "健康や病気について、人生に大きな影響を与えた出来事はありますか？",
      "これまでの人生で学んだ大切な教訓は何ですか？",
      "今、大事にしていることは何ですか？",
      "趣味や好きなことは何ですか？",
      "人生で最も幸せを感じた時期はいつですか？",
      "次の世代（子ども・孫など）に伝えたいメッセージは何ですか？",
      "家族や友人に伝えたいメッセージはありますか？",
      "職場や会社に対して伝えたいメッセージはありますか？",
      "これからの時間の中で、挑戦したいことはありますか？",
      "いま人生を振り返ってどう感じていますか？",
    ];

    console.log('💾 開始：19問のインタビューデータを interviews テーブルに保存');

    let savedCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO interviews (user_id, question, answer_text, duration_seconds, is_processed, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    // 各回答を interviews テーブルに保存
    answersWithPhotos.forEach((answer: any, index: number) => {
      try {
        const question = INTERVIEW_QUESTIONS[index] || `質問${index + 1}`;
        const answerText = answer.text || '';
        
        // ✅ 重要な出来事情報を answer_text に含める
        let fullAnswerText = answerText;
        if (answer.isImportant && answer.eventTitle) {
          fullAnswerText += `\n\n【重要な出来事】\nタイトル: ${answer.eventTitle}`;
          if (answer.eventAge !== undefined) {
            fullAnswerText += `\n出来事時の年齢: ${answer.eventAge}歳`;
          }
          if (answer.year) {
            fullAnswerText += `\n出来事の年: ${answer.year}`;
          }
          if (answer.month) {
            fullAnswerText += `\n出来事の月: ${answer.month}月`;
          }
        }

        const result = insertStmt.run(
          userId,
          question,
          fullAnswerText,
          null,  // duration_seconds
          0      // is_processed
        );

        console.log(`✅ [${index + 1}/${answersWithPhotos.length}] Question saved - ID: ${result.lastInsertRowid}`);
        console.log(`   質問: ${question.substring(0, 50)}...`);
        console.log(`   回答: ${answerText.substring(0, 50)}...`);
        
        // ✅ 写真がある場合は保存（オプション）
        if (answer.photos && Array.isArray(answer.photos) && answer.photos.length > 0) {
          const photoStmt = db.prepare(`
            INSERT INTO photos (user_id, file_path, description, uploaded_at)
            VALUES (?, ?, ?, datetime('now'))
          `);

          answer.photos.forEach((photo: any, photoIdx: number) => {
            try {
              photoStmt.run(
                userId,
                photo.file_path || '',
                photo.description || `Photo ${photoIdx + 1} for Q${index + 1}`,
              );
              console.log(`   📸 Photo ${photoIdx + 1} saved`);
            } catch (photoError: any) {
              console.warn(`   ⚠️ Photo save failed: ${photoError.message}`);
            }
          });
        }

        savedCount++;
      } catch (insertError: any) {
        console.error(`❌ Failed to save question ${index + 1}:`, insertError.message);
      }
    });

    console.log(`✅ インタビューデータ保存完了: ${savedCount}/${answersWithPhotos.length}件保存`);

    // ✅ インタビュー保存完了
    console.log('✅ Interview save completed successfully');
    res.json({
      success: true,
      message: `Interview answers saved successfully (${savedCount}/${answersWithPhotos.length} saved). Ready for AI generation.`,
      userId: userId,
      savedCount: savedCount,
      totalCount: answersWithPhotos.length
    });

  } catch (error: any) {
    console.error('❌ Error in POST /api/interview/save:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to save interview',
      details: error.message
    });
  }
});

// ============================================
// GET /api/interview/questions - インタビュー質問一覧取得
// ============================================
router.get('/questions', (req: Request, res: Response) => {
  try {
    const INTERVIEW_QUESTIONS = [
      { id: 1, question: 'お名前を教えてください。' },
      { id: 2, question: 'おいくつですか？' },
      { id: 3, question: '今、どこにお住まいですか？' },
      { id: 4, question: 'ご家族について教えてください。' },
      { id: 5, question: '子どもの頃の思い出を教えてください。' },
      { id: 6, question: '学生時代はどのように過ごしましたか？' },
      { id: 7, question: 'どのような仕事をされていましたか？' },
      { id: 8, question: 'これまでの人生で最も大切な出来事は何ですか？' },
      { id: 9, question: 'どのような趣味や好きなことがありますか？' },
      { id: 10, question: '旅行の思い出や行きたい場所はありますか？' },
      { id: 11, question: 'これまでの人生で学んだ大切なことは何ですか？' },
      { id: 12, question: '人生で後悔していることはありますか？' },
      { id: 13, question: '誇りに思っていることは何ですか？' },
      { id: 14, question: 'ご友人との関係について教えてください。' },
      { id: 15, question: '人生で最も幸せを感じた時期はいつですか？' },
      { id: 16, question: '今、大切にしていることは何ですか？' },
      { id: 17, question: '将来やってみたいことはありますか？' },
      { id: 18, question: 'ご家族や友人に伝えたいことはありますか？' },
      { id: 19, question: '最後に、自分の人生について一言お願いします。' }
    ];

    console.log('📖 Question list request - total:', INTERVIEW_QUESTIONS.length);
    res.json(INTERVIEW_QUESTIONS);
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
