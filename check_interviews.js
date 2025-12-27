import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, './data/jibunshi.db');
const db = new Database(dbPath);

console.log('=== interviews テーブル ===');
const interviews = db.prepare('SELECT id, user_id, question, LENGTH(answer_text) as answer_length FROM interviews WHERE user_id = 1 ORDER BY id').all();
console.log('件数:', interviews.length);
console.log(JSON.stringify(interviews, null, 2));

if (interviews.length > 0) {
  console.log('\n=== 最初の質問・回答 ===');
  const first = db.prepare('SELECT * FROM interviews WHERE user_id = 1 LIMIT 1').get();
  console.log(JSON.stringify(first, null, 2));
}

db.close();