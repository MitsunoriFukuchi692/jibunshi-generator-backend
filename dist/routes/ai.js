import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js'; // ✅ 修正: getDb をインポート
import { verifyToken, extractToken } from '../utils/auth.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
// Anthropicインスタンスを遅延初期化する関数
const getAnthropicClient = () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    return new Anthropic({
        apiKey,
    });
};
// ============================================
// POST /api/ai/analyze-photo - 写真分析
// ============================================
router.post('/analyze-photo', async (req, res) => {
    try {
        const anthropic = getAnthropicClient();
        const { photoPath } = req.body;
        if (!photoPath) {
            return res.status(400).json({ error: 'photoPath is required' });
        }
        const fullPath = path.join(__dirname, '../../', photoPath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Photo file not found' });
        }
        const imageBuffer = fs.readFileSync(fullPath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = photoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mimeType,
                                data: base64Image,
                            },
                        },
                        {
                            type: 'text',
                            text: `この写真を詳細に分析してください。以下の情報をJSON形式で返してください：
{
  "scene_description": "写真の場面の詳細な説明",
  "estimated_era": "推定される時代・年代",
  "suggested_stage": "suggested_stageはbirth,childhood,school,work,memory,retirementのいずれか",
  "emotional_context": "写真が表現する感情や雰囲気",
  "suggested_questions": ["質問1", "質問2", "質問3"]
}`,
                        },
                    ],
                },
            ],
        });
        const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse analysis' };
        res.json(analysis);
    }
    catch (error) {
        console.error('❌ Photo analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// POST /api/ai/generate-questions - 質問生成
// ============================================
router.post('/generate-questions', async (req, res) => {
    try {
        const anthropic = getAnthropicClient();
        const { userName, age, stage, photoDescription } = req.body;
        if (!stage) {
            return res.status(400).json({ error: 'stage is required' });
        }
        const prompt = `高齢者のための人生回想インタビューで、次のステージについて質問を生成してください。

ユーザー情報：
- 名前: ${userName || '不明'}
- 年齢: ${age || '不明'}
- 現在のステージ: ${stage}
${photoDescription ? `- 写真の説明: ${photoDescription}` : ''}

要件：
- 温かみのある質問を5個生成
- 思い出を引き出す質問
- 感覚（匂い、音、季節感）に関する質問
- 家族や周辺の人について質問
- 高齢者が答えやすい言葉遣い

以下のJSON形式で返してください：
{
  "stage": "${stage}",
  "questions": [
    "質問1",
    "質問2",
    "質問3",
    "質問4",
    "質問5"
  ]
}`;
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });
        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const questions = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse questions' };
        res.json(questions);
    }
    catch (error) {
        console.error('❌ Question generation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// POST /api/ai/edit-text - テキスト自動修正
// ============================================
router.post('/edit-text', async (req, res) => {
    try {
        const anthropic = getAnthropicClient();
        const { responses, stage, user_id, user_prompt } = req.body;
        const authHeader = req.headers.authorization;
        const token = extractToken(authHeader);
        console.log('📝 edit-text リクエスト受信');
        console.log('👤 user_id:', user_id);
        console.log('🎭 stage:', stage);
        console.log('📨 user_prompt:', user_prompt ? '✅ あり' : '❌ なし');
        console.log('📨 responses:', responses ? `✅ ${responses.length}件` : '❌ なし');
        // 認証チェック
        if (!token) {
            return res.status(401).json({ error: '認証が必要です' });
        }
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: '無効または期限切れのトークンです' });
        }
        // 本人確認
        if (decoded.userId !== user_id) {
            return res.status(403).json({ error: 'アクセス権限がありません' });
        }
        // ✅ 修正: getDb() を使用
        const db = getDb();
        // user_idが実際に存在するか確認
        const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
        if (!userCheck) {
            console.error('❌ ユーザーが見つかりません:', user_id);
            return res.status(400).json({ error: 'ユーザーが見つかりません' });
        }
        // user_prompt があるか responses 配列があるか対応
        let finalPrompt = '';
        if (user_prompt) {
            // 新しいフォーマット：TextCorrectionPage から送られる user_prompt
            console.log('✅ user_prompt フォーマットで処理');
            finalPrompt = user_prompt;
        }
        else if (responses && Array.isArray(responses) && responses.length > 0) {
            // レガシーフォーマット：responses 配列から生成
            console.log('✅ responses フォーマットで処理');
            const responsesText = responses
                .map((r, i) => `【回答${i + 1}】\n${r}`)
                .join('\n\n');
            finalPrompt = `以下は高齢者の人生回想の断片です（ステージ: ${stage}）。
これらを統合して、一つのまとまった文章にしてください。

要件：
- 時系列順に整理
- 重複を削除
- 読みやすく、流れが良い文章に
- 原文の感情や思い出は保持
- 段落は3～4行ごと
- 敬語から適切な文体に調整

---
${responsesText}
---

統合版をそのまま返してください（マークダウンなし、JSON形式なし）。`;
        }
        else {
            return res.status(400).json({
                error: 'user_prompt or responses array is required',
                received: { user_prompt: !!user_prompt, responses: !!responses }
            });
        }
        console.log('🤖 Claude API にテキスト修正リクエスト送信...');
        console.log('🔑 API Key exists:', !!process.env.ANTHROPIC_API_KEY);
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [
                {
                    role: 'user',
                    content: finalPrompt,
                },
            ],
        });
        const editedText = response.content[0].type === 'text' ? response.content[0].text : '';
        console.log('✅ 修正テキスト取得完了');
        console.log('📏 修正テキスト長:', editedText.length, '文字');
        // ✅ ここで timeline には保存しない
        // TextCorrectionPage の handleSaveCompletion() が保存を担当する
        res.json({
            edited_content: editedText,
            message: 'テキスト修正が完了しました。TextCorrectionPage で確認・保存してください。'
        });
    }
    catch (error) {
        console.error('❌ Text edit error:', error);
        console.error('📋 Error message:', error.message);
        console.error('📋 Error code:', error.code);
        res.status(500).json({ error: error.message });
    }
});
export default router;
//# sourceMappingURL=ai.js.map