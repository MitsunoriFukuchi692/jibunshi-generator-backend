import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/jibunshi.db');
const db = new Database(dbPath);

const router = Router();

// 質問リスト（ハードコード）
const questions = [
  "どこで、いつ生まれましたか？",
  "子どもの頃、どんな環境で育ちましたか？",
  "学生時代で印象に残っていることはありますか？",
  "初めての仕事について教えてください",
  "仕事人生で最も大切な経験は何ですか？",
  "家族との関係について聞かせてください",
  "人生で乗り越えた大きな困難はありますか？",
  "趣味や好きなことは何ですか？",
  "友人との思い出で特別なものはありますか？",
  "人生で最も幸せを感じた時期はいつですか？",
  "これまでの人生で学んだ大切な教訓は何ですか？",
  "今、大事にしていることは何ですか？",
  "後世に伝えたいメッセージはありますか？",
  "人生を振り返って、どう感じていますか？",
  "これからの人生で挑戦したいことはありますか？",
];

// POST /api/interview/question - 次の質問を取得
router.post('/question', async (req: Request, res: Response) => {
  try {
    const { user_id, conversation_history } = req.body;

    console.log('📝 [Interview] Request received');
    console.log('👤 user_id:', user_id);
    console.log('💬 conversation_history length:', conversation_history?.length || 0);

    if (!user_id) {
      console.error('❌ user_id is missing');
      return res.status(400).json({ error: 'user_id is required' });
    }

    // 現在の質問番号を計算
    const currentQuestionIndex = Math.floor((conversation_history?.length || 0) / 2);

    console.log('📌 Current question index:', currentQuestionIndex);

    // すべての質問が終わったか確認
    if (currentQuestionIndex >= questions.length) {
      console.log('✅ Interview completed');
      return res.json({
        completed: true,
        summary: 'インタビューを完了しました。ご協力ありがとうございました。'
      });
    }

    // 次の質問を取得
    const nextQuestion = questions[currentQuestionIndex];

    console.log('❓ Next question:', nextQuestion);

    res.json({
      completed: false,
      question: nextQuestion,
    });

  } catch (error: any) {
    console.error('❌ Interview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/interview/save - 会話履歴を保存
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { user_id, conversation } = req.body;

    console.log('💾 [Save] Request received');
    console.log('👤 user_id:', user_id);
    console.log('📝 conversation length:', conversation?.length || 0);

    if (!user_id || !conversation) {
      return res.status(400).json({ error: 'user_id and conversation are required' });
    }

    // 会話テキストに変換
    const conversationText = conversation
      .map((msg: any) => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`)
      .join('\n');

    // responses テーブルに保存
    const stmt = db.prepare(
      `INSERT INTO responses (user_id, stage, question_text, response_text)
       VALUES (?, ?, ?, ?)`
    );

    stmt.run(user_id, 'interview', 'AI Interview', conversationText);

    console.log('✅ Conversation saved successfully');
    res.json({ message: 'インタビューが保存されました' });
  } catch (error: any) {
    console.error('❌ Save error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;