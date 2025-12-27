import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, './data/jibunshi.db');
const db = new Database(dbPath);

console.log('=== biography テーブル ===');
const bio = db.prepare('SELECT id, user_id, LENGTH(edited_content) as content_length, edited_content FROM biography WHERE user_id = 1').all();
console.log(JSON.stringify(bio, null, 2));

console.log('\n=== biography_photos テーブル ===');
const photos = db.prepare('SELECT * FROM biography_photos WHERE biography_id IN (SELECT id FROM biography WHERE user_id = 1)').all();
console.log(JSON.stringify(photos, null, 2));

db.close();