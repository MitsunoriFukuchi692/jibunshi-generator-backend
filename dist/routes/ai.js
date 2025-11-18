import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
// ============================================
// POST /api/ai/analyze-photo - 写真分析
// ============================================
router.post('/analyze-photo', async (req, res) => {
    try {
        const { photoPath } = req.body;
        if (!photoPath) {
            return res.status(400).json({ error: 'photoPath is required' });
        }
        // ファイルパスを安全に構築
        const fullPath = path.join(__dirname, '../../', photoPath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Photo file not found' });
        }
        // 画像をBase64エンコード
        const imageBuffer = fs.readFileSync(fullPath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = photoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        // Claude Vision で画像分析
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
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
        // JSON抽出
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
- 家族や周囲の人についての質問
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
            model: 'claude-3-5-sonnet-20241022',
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
// POST /api/ai/edit-text - テキスト自動編集
// ============================================
router.post('/edit-text', async (req, res) => {
    try {
        const { responses, stage } = req.body;
        if (!responses || !Array.isArray(responses) || responses.length === 0) {
            return res.status(400).json({ error: 'responses array is required' });
        }
        const responsesText = responses
            .map((r, i) => `【回答${i + 1}】\n${r}`)
            .join('\n\n');
        const prompt = `以下は高齢者の人生回想の断片です（ステージ: ${stage}）。
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
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });
        const editedText = response.content[0].type === 'text' ? response.content[0].text : '';
        res.json({
            stage,
            original_count: responses.length,
            edited_content: editedText,
        });
    }
    catch (error) {
        console.error('❌ Text edit error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
//# sourceMappingURL=ai.js.map