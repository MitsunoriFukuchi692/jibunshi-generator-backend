import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '../db.js';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');
const router = Router();

// POST /api/interview/question - 次の質問を生成
router.post('/question', async (req: Request, res: Response) => {
  try {
    const { user_id, conversation_history } = req.body;

    console.log('📖 [Interview] Request received');
    console.log('👤 user_id:', user_id);
    console.log('💬 conversation_history length:', conversation_history?.length || 0);

    if (!user_id) {
      console.error('❌ user_id is missing');
      return res.status(400).json({ error: 'user_id is required' });
    }

    // 会話履歴をテキスト形式に変換
    let conversationText = '';
    if (conversation_history && conversation_history.length > 0) {
      conversationText = conversation_history
        .map((msg: any) => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`)
        .join('\n');
    }

    console.log('📄 conversationText:', conversationText.substring(0, 100) + (conversationText.length > 100 ? '...' : ''));

    // Google Gemini API で次の質問を生成
    const systemPrompt = `あなたは高齢者の自分史作成を支援するインタビュアーです。
ユーザーの人生経験を引き出すために、適切な質問をしてください。

目的：
- ユーザーの生い立ち、環境、経験を詳しく聞く
- 人生の重要な転機やターニングポイントを自然に引き出す
- 感情や思いを深掘りする

進め方：
1. 最初の質問：「どこで、いつ生まれましたか？」から始まる
2. 以降：ユーザーの回答に基づいて、関連する質問を続ける
3. 15～20問程度でインタビューを完了する

ユーザーが十分に話してくれたと判断したら、JSONで以下の形式で返してください：
{"completed": true, "summary": "インタビューの要約"}

通常は、JSONで以下の形式で返してください：
{"completed": false, "question": "次の質問内容"}`;

    const userMessage = conversationText
      ? `これまでの会話：\n${conversationText}\n\n次の質問を生成してください。`
      : '初めての質問を生成してください。';

    console.log('🔌 Google Gemini API Key exists:', !!process.env.GOOGLE_GEMINI_API_KEY);
    console.log('🚀 Calling Google Gemini API...');

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n' + userMessage }],
        },
      ],
    });

    const responseText = result.response.text();
    console.log('✅ Google Gemini API response received');
    console.log('📄 Response text:', responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''));

    // JSON またはテキストをパース
    try {
      const parsed = JSON.parse(responseText);
      console.log('✅ JSON parsed successfully:', parsed);
      res.json(parsed);
    } catch {
      // JSON でない場合はテキストを質問として返す
      console.log('⚠️ Response is not JSON, treating as plain text');
      res.json({
        completed: false,
        question: responseText,
      });
    }
  } catch (error: any) {
    console.error('❌ Interview error:', error);
    console.error('❌ Error message:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/interview/save - 会話履歴を保存
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { user_id, conversation } = req.body;
    const db = getDb();

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

    // responses テーブルに保存（インタビュー記録として）
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
