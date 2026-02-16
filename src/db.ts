import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbConnection: any = null;
let isPostgres = false;

export async function initDb(): Promise<void> {
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
      
      // Quarter マイグレーション実行
      await runQuarterMigrationPostgres(pool);
      console.log('✅ Quarter migration completed');
    } catch (error) {
      console.error('❌ Failed to initialize PostgreSQL:', error);
      throw error;
    }
  } else {
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
      
      // Quarter マイグレーション実行
      runQuarterMigrationSqlite(sqlite);
      console.log('✅ Quarter migration completed');
    } catch (error) {
      console.error('❌ Failed to initialize SQLite:', error);
      throw error;
    }
  }
}

function createTablesSqlite(db: any): void {
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

async function createTablesPostgres(pool: Pool): Promise<void> {
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
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        console.error('Table creation error:', error.message);
      }
    }
  }
}

export function getDb(): any {
  if (!dbConnection) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbConnection;
}

export async function closeDb(): Promise<void> {
  if (dbConnection) {
    if (isPostgres) {
      await dbConnection.end();
    } else {
      dbConnection.close();
    }
    dbConnection = null;
    console.log('Database connection closed');
  }
}

export function isPostgresConnection(): boolean {
  return isPostgres;
}

// ===== PostgreSQL互換性ラッパー =====
export const sqliteToPostgres = (sql: string): string => {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
};

export async function queryRow(sql: string, params: any[] = []): Promise<any> {
  const db = getDb();
  const convertedSql = sqliteToPostgres(sql);
  
  if (isPostgres) {
    const result = await db.query(convertedSql, params);
    return result.rows[0];
  } else {
    const stmt = db.prepare(sql);
    return stmt.get(params);
  }
}

export async function queryAll(sql: string, params: any[] = []): Promise<any[]> {
  const db = getDb();
  const convertedSql = sqliteToPostgres(sql);
  
  if (isPostgres) {
    const result = await db.query(convertedSql, params);
    return result.rows;
  } else {
    const stmt = db.prepare(sql);
    return stmt.all(params);
  }
}

export async function queryRun(sql: string, params: any[] = []): Promise<any> {
  const db = getDb();
  const convertedSql = sqliteToPostgres(sql);
  
  if (isPostgres) {
    return await db.query(convertedSql, params);
  } else {
    const stmt = db.prepare(sql);
    return stmt.run(params);
  }
}

// ============================================
// ✅ Quarter マイグレーション関数
// ============================================

function runQuarterMigrationSqlite(db: any): void {
  try {
    // interview_sessions に quarter カラムを追加
    db.exec(`
      ALTER TABLE interview_sessions ADD COLUMN quarter TEXT DEFAULT '2026-Q1' NOT NULL;
    `);
    console.log('✅ Added quarter column to interview_sessions (SQLite)');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('ℹ️ quarter column already exists in interview_sessions (SQLite)');
    } else {
      console.warn('⚠️ Failed to add quarter to interview_sessions:', error.message);
    }
  }

  try {
    // timeline に quarter カラムを追加
    db.exec(`
      ALTER TABLE timeline ADD COLUMN quarter TEXT DEFAULT '2026-Q1' NOT NULL;
    `);
    console.log('✅ Added quarter column to timeline (SQLite)');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('ℹ️ quarter column already exists in timeline (SQLite)');
    } else {
      console.warn('⚠️ Failed to add quarter to timeline:', error.message);
    }
  }

  try {
    // インデックスを追加
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_interview_sessions_userId_quarter 
        ON interview_sessions(user_id, quarter);
      CREATE INDEX IF NOT EXISTS idx_timeline_userId_quarter 
        ON timeline(user_id, quarter);
    `);
    console.log('✅ Added quarter indexes (SQLite)');
  } catch (error: any) {
    console.warn('⚠️ Failed to add quarter indexes:', error.message);
  }
}

async function runQuarterMigrationPostgres(pool: Pool): Promise<void> {
  try {
    // interview_sessions に quarter カラムを追加
    await pool.query(`
      ALTER TABLE interview_sessions 
      ADD COLUMN IF NOT EXISTS quarter TEXT DEFAULT '2026-Q1' NOT NULL;
    `);
    console.log('✅ Added quarter column to interview_sessions (PostgreSQL)');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️ quarter column already exists in interview_sessions (PostgreSQL)');
    } else {
      console.warn('⚠️ Failed to add quarter to interview_sessions:', error.message);
    }
  }

  try {
    // timeline に quarter カラムを追加
    await pool.query(`
      ALTER TABLE timeline 
      ADD COLUMN IF NOT EXISTS quarter TEXT DEFAULT '2026-Q1' NOT NULL;
    `);
    console.log('✅ Added quarter column to timeline (PostgreSQL)');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️ quarter column already exists in timeline (PostgreSQL)');
    } else {
      console.warn('⚠️ Failed to add quarter to timeline:', error.message);
    }
  }

  try {
    // インデックスを追加
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_interview_sessions_userId_quarter 
        ON interview_sessions(user_id, quarter);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timeline_userId_quarter 
        ON timeline(user_id, quarter);
    `);
    console.log('✅ Added quarter indexes (PostgreSQL)');
  } catch (error: any) {
    console.warn('⚠️ Failed to add quarter indexes:', error.message);
  }
}

