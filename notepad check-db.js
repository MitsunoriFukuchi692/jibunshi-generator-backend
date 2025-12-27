const Database = require('better-sqlite3');
const db = new Database('./data/jibunshi.db');

console.log('=== Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(t.name));

console.log('\n=== timeline_metadata ===');
const timeline = db.prepare('SELECT * FROM timeline_metadata').all();
console.log(JSON.stringify(timeline, null, 2));

db.close();