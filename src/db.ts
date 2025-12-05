import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');

// data フォルダを自動作成
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`✅ data フォルダを作成しました: ${dataDir}`);
}

const dbPath = path.join(dataDir, 'jibunshi.db');

console.log(`📁 Database path: ${dbPath}`);

const db = new Database(dbPath);
// テーブル作成
const createTables = () => {
  // 既存のテーブルを削除（テスト用 - 開発環境でのみ）
  //db.exec(`DROP TABLE IF EXISTS users;`);
  //db.exec(`DROP TABLE IF EXISTS photos;`);
  //db.exec(`DROP TABLE IF EXISTS questions;`);
  //db.exec(`DROP TABLE IF EXISTS responses;`);
  //db.exec(`DROP TABLE IF EXISTS timeline;`);
  //db.exec(`DROP TABLE IF EXISTS pdf_versions;`);

  // その後、新しいスキーマで作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      age INTEGER,
      birth_date DATE,
      gender TEXT,
      address TEXT,
      occupation TEXT,
      bio TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      progress_stage TEXT DEFAULT 'birth',
      estimated_completion_date DATE
    );
  `);

  // photos テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      stage TEXT,
      description TEXT,
      ai_analysis TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // questions テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,
      order_num INTEGER,
      template_text TEXT NOT NULL,
      photo_id INTEGER,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (photo_id) REFERENCES photos(id)
    );
  `);

  // responses テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER,
      stage TEXT NOT NULL,
      question_text TEXT NOT NULL,
      response_text TEXT NOT NULL,
      is_voice BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      photo_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (photo_id) REFERENCES photos(id)
    );
  `);

  // timeline テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      age INTEGER,
      year INTEGER,
      stage TEXT,
      event_title TEXT,
      event_description TEXT,
      edited_content TEXT,
      is_auto_generated BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // pdf_versions テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      version INTEGER DEFAULT 1,
      html_content TEXT,
      pdf_path TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'draft',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  console.log('✅ All tables created successfully!');
};

createTables();
console.log('✅ Database initialized');