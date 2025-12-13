import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data/jibunshi.db');

console.log('📂 Database path:', dbPath);

try {
  const db = new Database(dbPath);
  
  console.log('\n========================================');
  console.log('最新の timeline レコードを確認');
  console.log('========================================\n');
  
  const query = `
    SELECT 
      id,
      user_id,
      event_title,
      LENGTH(edited_content) as edited_content_length,
      LENGTH(event_description) as event_description_length,
      substr(edited_content, 1, 150) as edited_content_preview,
      substr(event_description, 1, 150) as event_description_preview,
      created_at
    FROM timeline
    WHERE user_id = 11
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const result = db.prepare(query).get();
  
  if (result) {
    console.log('✅ タイムラインレコードが見つかりました\n');
    console.log('id:', result.id);
    console.log('user_id:', result.user_id);
    console.log('event_title:', result.event_title);
    console.log('\n📝 edited_content_length:', result.edited_content_length);
    console.log('📝 event_description_length:', result.event_description_length);
    console.log('\n📄 edited_content_preview:');
    console.log(result.edited_content_preview);
    console.log('\n📄 event_description_preview:');
    console.log(result.event_description_preview);
    console.log('\n⏰ created_at:', result.created_at);
    
    console.log('\n========================================');
    console.log('診断結果');
    console.log('========================================\n');
    
    if (result.edited_content_length && result.edited_content_length > 100) {
      console.log('✅ edited_content に修正済みテキストが入っている可能性が高い');
    } else {
      console.log('❌ edited_content が空またはおかしい');
    }
    
    if (result.event_description_preview && result.event_description_preview.includes('AI:')) {
      console.log('❌ event_description にインタビュー内容が入っている');
    } else if (result.event_description_preview) {
      console.log('⚠️ event_description に何か入っている');
    } else {
      console.log('✅ event_description は空（正常）');
    }
    
  } else {
    console.log('❌ user_id = 11 のタイムラインレコードが見つかりません');
    console.log('\n全タイムラインレコード:');
    const allRecords = db.prepare('SELECT id, user_id, event_title, created_at FROM timeline ORDER BY created_at DESC LIMIT 5').all();
    console.log(allRecords);
  }
  
  db.close();
  
} catch (error) {
  console.error('❌ エラー:', error);
}