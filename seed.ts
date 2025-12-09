import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data/jibunshi.db');
const db = new Database(dbPath);

console.log('🌱 Seeding test data...');

try {
  const userStmt = db.prepare(`
    INSERT INTO users (name, age, password) 
    VALUES (?, ?, ?)
  `);
  const userResult = userStmt.run('テスト太郎', 65, 'testpassword123');
  const userId = userResult.lastInsertRowid;
  console.log(`✅ Created user: id=${userId}, name=テスト太郎`);
  
  const timelineStmt = db.prepare(`
    INSERT INTO timeline (user_id, year, month, turning_point, event_description, edited_content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const timelines = [
    {
      year: 1960,
      month: 4,
      turning_point: '誕生',
      event_description: '生まれた',
      edited_content: '昭和35年4月に東京で生まれました。母は看護師、父は銀行員でした。'
    },
    {
      year: 1980,
      month: 9,
      turning_point: '進学',
      event_description: '大学に入った',
      edited_content: '東京の大学に進学し、新しい世界が広がりました。友人との出会いが人生を変えました。'
    },
    {
      year: 2000,
      month: 3,
      turning_point: '転職',
      event_description: '会社を立ち上げた',
      edited_content: '自分の会社を立ち上げました。人生の転機となりました。多くの課題に直面しましたが、乗り越えることができました。'
    },
    {
      year: 2015,
      month: 7,
      turning_point: '家族',
      event_description: '孫が生まれた',
      edited_content: '初孫が生まれました。人生で最も幸せな瞬間の一つです。子どもから親へ、親から祖父へと立場が変わりました。'
    }
  ];

  timelines.forEach((timeline) => {
    const result = timelineStmt.run(
      userId,
      timeline.year,
      timeline.month,
      timeline.turning_point,
      timeline.event_description,
      timeline.edited_content
    );
    console.log(`✅ Created timeline: id=${result.lastInsertRowid}, year=${timeline.year}, month=${timeline.month}`);
  });

  console.log('🌱 Seeding completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
} finally {
  db.close();
}
