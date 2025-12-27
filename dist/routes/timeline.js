import { Router } from 'express';
import { getDb } from '../db.js';
import { verifyToken, extractToken } from '../utils/auth.js';
const router = Router();
// ============================================
// 認証ミドルウェア
// ============================================
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    if (!token) {
        return res.status(401).json({ error: '認証が必要です。トークンが見つかりません。' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: '無効または期限切れのトークンです。' });
    }
    req.user = decoded;
    next();
};
// ============================================
// GET /api/timeline - biography + timeline_metadata 統合取得
// ============================================
router.get('/', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        // biography を取得
        const biography = db.prepare(`
      SELECT id, user_id, edited_content, ai_summary, created_at, updated_at
      FROM biography 
      WHERE user_id = ?
    `).get(user.userId);
        // timeline_metadata を取得
        const timelineMetadata = db.prepare(`
      SELECT id, user_id, important_events, created_at, updated_at
      FROM timeline_metadata
      WHERE user_id = ?
    `).get(user.userId);
        // important_events JSON をパース
        const parsedTimeline = timelineMetadata ? {
            ...timelineMetadata,
            important_events: JSON.parse(timelineMetadata.important_events)
        } : null;
        res.json({
            biography: biography || null,
            timeline: parsedTimeline || null
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// POST /api/timeline/biography - 自分史物語を作成/更新
// ============================================
router.post('/biography', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        const { edited_content, ai_summary, answersWithPhotos } = req.body;
        console.log('💾 Biography creation request:', {
            userId: user.userId,
            contentLength: edited_content?.length || 0,
            photoCount: answersWithPhotos?.length || 0
        });
        // edited_content は必須
        if (!edited_content || edited_content.trim() === '') {
            return res.status(400).json({ error: 'edited_content is required' });
        }
        let biographyId;
        // 既存の biography をチェック
        const existingBiography = db.prepare('SELECT id FROM biography WHERE user_id = ?').get(user.userId);
        if (existingBiography) {
            // 更新
            const stmt = db.prepare(`
        UPDATE biography 
        SET edited_content = ?, ai_summary = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `);
            stmt.run(edited_content, ai_summary || null, user.userId);
            biographyId = existingBiography.id;
            console.log('✅ Biography updated - id:', biographyId);
        }
        else {
            // 新規作成
            const stmt = db.prepare(`
        INSERT INTO biography (user_id, edited_content, ai_summary, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `);
            const result = stmt.run(user.userId, edited_content, ai_summary || null);
            biographyId = result.lastInsertRowid;
            console.log('✅ Biography created - id:', biographyId);
        }
        // ============================================
        // 写真を保存
        // ============================================
        if (answersWithPhotos && Array.isArray(answersWithPhotos) && answersWithPhotos.length > 0) {
            // 既存の写真を削除
            db.prepare('DELETE FROM biography_photos WHERE biography_id = ?').run(biographyId);
            const photoStmt = db.prepare(`
        INSERT INTO biography_photos (biography_id, file_path, description, display_order, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);
            let photoCount = 0;
            // answersWithPhotos から全ての写真を抽出
            for (const item of answersWithPhotos) {
                if (item && item.photos && Array.isArray(item.photos)) {
                    for (const photo of item.photos) {
                        if (photo && photo.file_path) {
                            photoStmt.run(biographyId, photo.file_path, photo.description || `Photo ${photoCount + 1}`, photoCount);
                            photoCount++;
                            console.log('📸 Photo saved:', photo.file_path);
                        }
                    }
                }
            }
            console.log('✅ Photos saved:', photoCount);
        }
        else {
            console.log('⚠️ No photos to save');
        }
        res.status(201).json({
            success: true,
            data: {
                id: biographyId,
                userId: user.userId,
                contentLength: edited_content.length,
                photoCount: answersWithPhotos?.length || 0
            }
        });
    }
    catch (error) {
        console.error('❌ Error in POST /api/timeline/biography:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// POST /api/timeline/metadata - 人生年表を作成/更新
// ============================================
router.post('/metadata', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        const { important_events } = req.body;
        console.log('💾 Timeline metadata creation request:', {
            userId: user.userId,
            eventCount: important_events?.length || 0
        });
        // important_events は必須
        if (!important_events || !Array.isArray(important_events)) {
            return res.status(400).json({ error: 'important_events array is required' });
        }
        // JSON 文字列化
        const importantEventsJson = JSON.stringify(important_events);
        let metadataId;
        // 既存の timeline_metadata をチェック
        const existingMetadata = db.prepare('SELECT id FROM timeline_metadata WHERE user_id = ?').get(user.userId);
        if (existingMetadata) {
            // 更新
            const stmt = db.prepare(`
        UPDATE timeline_metadata
        SET important_events = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `);
            stmt.run(importantEventsJson, user.userId);
            metadataId = existingMetadata.id;
            console.log('✅ Timeline metadata updated - id:', metadataId);
        }
        else {
            // 新規作成
            const stmt = db.prepare(`
        INSERT INTO timeline_metadata (user_id, important_events, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `);
            const result = stmt.run(user.userId, importantEventsJson);
            metadataId = result.lastInsertRowid;
            console.log('✅ Timeline metadata created - id:', metadataId);
        }
        res.status(201).json({
            success: true,
            data: {
                id: metadataId,
                userId: user.userId,
                eventCount: important_events.length
            }
        });
    }
    catch (error) {
        console.error('❌ Error in POST /api/timeline/metadata:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// GET /api/timeline/biography - 自分史物語のみ取得
// ============================================
router.get('/biography', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        const biography = db.prepare(`
      SELECT id, user_id, edited_content, ai_summary, created_at, updated_at
      FROM biography 
      WHERE user_id = ?
    `).get(user.userId);
        if (!biography) {
            return res.status(404).json({ error: 'Biography not found' });
        }
        // 写真も取得
        const photos = db.prepare(`
      SELECT id, file_path, description, display_order
      FROM biography_photos
      WHERE biography_id = ?
      ORDER BY display_order ASC
    `).all(biography.id);
        res.json({
            ...biography,
            photos: photos || []
        });
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// GET /api/timeline/metadata - 人生年表のみ取得
// ============================================
router.get('/metadata', authenticate, (req, res) => {
    try {
        const user = req.user;
        const db = getDb();
        const metadata = db.prepare(`
      SELECT id, user_id, important_events, created_at, updated_at
      FROM timeline_metadata
      WHERE user_id = ?
    `).get(user.userId);
        if (!metadata) {
            return res.status(404).json({ error: 'Timeline metadata not found' });
        }
        // important_events JSON をパース
        const parsedMetadata = {
            ...metadata,
            important_events: JSON.parse(metadata.important_events)
        };
        res.json(parsedMetadata);
    }
    catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
//# sourceMappingURL=timeline.js.map