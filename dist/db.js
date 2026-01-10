import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let db = null;
export function initDb() {
    const dbPath = path.join(__dirname, '../data/jibunshi.db');
    db = new Database(dbPath);
    // 外部キー制約を有効化
    db.pragma('foreign_keys = ON');
    // ===== 既存テーブルを削除（初期化時） =====
    try {
        // db.exec(`
        // DROP TABLE IF EXISTS interviews;
        //DROP TABLE IF EXISTS pdf_versions;
        // DROP TABLE IF EXISTS timeline_photos;
        //  DROP TABLE IF EXISTS photos;
        // DROP TABLE IF EXISTS timeline;
        // DROP TABLE IF EXISTS users;
        //`);
        //console.log('✅ Dropped existing tables');
    }
    catch (error) {
        console.log('ℹ️ No existing tables to drop');
    }
    // ===== users テーブル - 改善版2 =====
    // ✅ 同じ名前の別人対応：(name, birth_month, birth_day) を複合UNIQUEキー
    // ✅ birth_year は年齢 + 現在年から自動計算（入力不要）
    // ✅ birth_month, birth_day は入力必須（月日で本人確認）
    // ✅ pin は必須（4桁数字）
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      birth_month INTEGER NOT NULL,
      birth_day INTEGER NOT NULL,
      birth_year INTEGER,
      pin TEXT NOT NULL,
      email TEXT,
      password TEXT,
      gender TEXT,
      address TEXT,
      occupation TEXT,
      bio TEXT,
      status TEXT DEFAULT 'active',
      progress_stage TEXT DEFAULT 'birth',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, birth_month, birth_day)
    )
  `);
    // ===== timeline テーブル =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      age INTEGER,
      year INTEGER,
      month INTEGER,
      turning_point TEXT,
      event_description TEXT,
      edited_content TEXT,
      ai_corrected_text TEXT,
      stage TEXT,
      event_title TEXT,
      is_auto_generated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== photos テーブル =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      timeline_id INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT,
      description TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE SET NULL
    )
  `);
    // ===== timeline_photos テーブル（タイムラインと写真の多対多関係） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeline_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE CASCADE
    )
  `);
    // ===== pdf_versions テーブル（PDF生成履歴） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== interviews テーブル（音声インタビュー記録） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question TEXT,
      answer_text TEXT,
      answer_audio_path TEXT,
      duration_seconds INTEGER,
      is_processed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== biography テーブル（自分史物語） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS biography (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      edited_content TEXT,
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== biography_photos テーブル（自分史に紐付く写真） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS biography_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      biography_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (biography_id) REFERENCES biography(id) ON DELETE CASCADE
    )
  `);
    // ===== interview_sessions テーブル（インタビューセッション永続化） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      current_question_index INTEGER NOT NULL DEFAULT 0,
      conversation TEXT NOT NULL DEFAULT '[]',
      answers_with_photos TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== sessions テーブル（ログインセッション管理） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ===== timeline_metadata テーブル（人生年表） =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      timeline_id INTEGER NOT NULL,
      important_events TEXT,
      turning_points TEXT,
      custom_metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE CASCADE,
      UNIQUE(user_id, timeline_id)
    )
  `);
    // ===== インデックス作成（クエリ高速化） =====
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_timeline_user_id ON timeline(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_user_year ON timeline(user_id, year);
    CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
    CREATE INDEX IF NOT EXISTS idx_photos_timeline_id ON photos(timeline_id);
    CREATE INDEX IF NOT EXISTS idx_pdf_versions_user_id ON pdf_versions(user_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_metadata_user_id ON timeline_metadata(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_metadata_timeline_id ON timeline_metadata(timeline_id);
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_name_birth ON users(name, birth_month, birth_day);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
    console.log('✅ Database initialized successfully');
}
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return db;
}
export function closeDb() {
    if (db) {
        db.close();
        db = null;
        console.log('Database connection closed');
    }
}
//# sourceMappingURL=db.js.map