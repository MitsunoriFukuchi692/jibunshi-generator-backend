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
    // ===== users テーブル =====
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      birth_date TEXT,
      gender TEXT,
      address TEXT,
      occupation TEXT,
      bio TEXT,
      status TEXT DEFAULT 'active',
      progress_stage TEXT DEFAULT 'birth',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // ============================================
    // 🆕 biography テーブル
    // 自分史物語（AI最終編集版）のみを保持
    // ============================================
    db.exec(`
    CREATE TABLE IF NOT EXISTS biography (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      edited_content TEXT NOT NULL,
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ============================================
    // 🆕 timeline_metadata テーブル
    // 人生年表（重要イベント）を独立管理
    // ============================================
    db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      important_events TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    // ============================================
    // biography_photos テーブル
    // 自分史物語に紐づける写真
    // ============================================
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
    // ============================================
    // interviews テーブル（音声インタビュー記録）
    // ============================================
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
    // ============================================
    // pdf_versions テーブル（PDF生成履歴）
    // ============================================
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
    // ===== インデックス作成（クエリ高速化） =====
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_biography_user_id ON biography(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_metadata_user_id ON timeline_metadata(user_id);
    CREATE INDEX IF NOT EXISTS idx_biography_photos_biography_id ON biography_photos(biography_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_pdf_versions_user_id ON pdf_versions(user_id);
  `);
    console.log('✅ Database initialized with new schema');
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