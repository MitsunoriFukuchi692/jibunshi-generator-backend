import Database from 'better-sqlite3';

const db = new Database('./data/jibunshi.db');

console.log('=== timeline_photos テーブル ===');
const photos1 = db.prepare('SELECT * FROM timeline_photos LIMIT 5').all();
console.log(JSON.stringify(photos1, null, 2));

console.log('\n=== photos テーブル ===');
const photos2 = db.prepare('SELECT * FROM photos LIMIT 5').all();
console.log(JSON.stringify(photos2, null, 2));

console.log('\n=== user_id=9 のタイムラインに紐付いた写真 ===');
const photos3 = db.prepare(`
  SELECT tp.* FROM timeline_photos tp
  WHERE tp.timeline_id IN (SELECT id FROM timeline WHERE user_id = 9)
  LIMIT 5
`).all();
console.log(JSON.stringify(photos3, null, 2));

process.exit(0);