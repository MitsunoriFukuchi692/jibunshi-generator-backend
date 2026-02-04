import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let dbConnection = null;
let isPostgres = false;
export async function initDb() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString && connectionString.startsWith('postgresql')) {
        console.log('📊 Using PostgreSQL (Supabase)');
        isPostgres = true;
        const pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 20,
        });
        dbConnection = pool;
        try {
            await createTablesPostgres(pool);
            console.log('✅ PostgreSQL database initialized');
        }
        catch (error) {
            console.error('❌ Failed to initialize PostgreSQL:', error);
            throw error;
        }
    }
    else {
        console.log('📊 Using SQLite (local development)');
        isPostgres = false;
        const dbPath = path.join(__dirname, '../data/jibunshi.db');
        const dbDir = path.dirname(dbPath);
        if (!existsSync(dbDir)) {
            mkdirSync(dbDir, { recursive: true });
        }
        const sqlite = new Database(dbPath);
        sqlite.pragma('foreign_keys = ON');
        dbConnection = sqlite;
        try {
            createTablesSqlite(sqlite);
            console.log('✅ SQLite database initialized');
        }
        catch (error) {
            console.error('❌ Failed to initialize SQLite:', error);
            throw error;
        }
    }
}
function createTablesSqlite(db) {
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
    );
    
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
    );
    
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
    );
    
    CREATE TABLE IF NOT EXISTS timeline_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeline_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE CASCADE
    );
    
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
    );
    
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
    );
    
    CREATE TABLE IF NOT EXISTS biography (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      edited_content TEXT,
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS biography_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      biography_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (biography_id) REFERENCES biography(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      current_question_index INTEGER NOT NULL DEFAULT 0,
      conversation TEXT NOT NULL DEFAULT '[]',
      answers_with_photos TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER,
      event_title TEXT,
      event_year INTEGER,
      event_month INTEGER,
      event_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
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
    );
    
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
    );
    
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
}
async function createTablesPostgres(pool) {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, birth_month, birth_day)
    )`,
        `CREATE TABLE IF NOT EXISTS timeline (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      timeline_id INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT,
      description TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE SET NULL
    )`,
        `CREATE TABLE IF NOT EXISTS timeline_photos (
      id SERIAL PRIMARY KEY,
      timeline_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS pdf_versions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS interviews (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      question TEXT,
      answer_text TEXT,
      answer_audio_path TEXT,
      duration_seconds INTEGER,
      is_processed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS biography (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      edited_content TEXT,
      ai_summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS biography_photos (
      id SERIAL PRIMARY KEY,
      biography_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (biography_id) REFERENCES biography(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS interview_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      current_question_index INTEGER NOT NULL DEFAULT 0,
      conversation TEXT NOT NULL DEFAULT '[]',
      answers_with_photos TEXT NOT NULL DEFAULT '[]',
      timestamp BIGINT,
      event_title TEXT,
      event_year INTEGER,
      event_month INTEGER,
      event_description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
        `CREATE TABLE IF NOT EXISTS timeline_metadata (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      timeline_id INTEGER NOT NULL,
      important_events TEXT,
      turning_points TEXT,
      custom_metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (timeline_id) REFERENCES timeline(id) ON DELETE CASCADE,
      UNIQUE(user_id, timeline_id)
    )`
    ];
    for (const query of queries) {
        try {
            await pool.query(query);
        }
        catch (error) {
            if (!error.message.includes('already exists')) {
                console.error('Table creation error:', error.message);
            }
        }
    }
}
export function getDb() {
    if (!dbConnection) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return dbConnection;
}
export async function closeDb() {
    if (dbConnection) {
        if (isPostgres) {
            await dbConnection.end();
        }
        else {
            dbConnection.close();
        }
        dbConnection = null;
        console.log('Database connection closed');
    }
}
export function isPostgresConnection() {
    return isPostgres;
}
//# sourceMappingURL=Olddb.js.map