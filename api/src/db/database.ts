import Database from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";

const dbPath = path.resolve(process.cwd(), "whisperself.db");
const db: Database.Database = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used TEXT,
    is_active INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    transcript TEXT NOT NULL,
    language TEXT,
    duration REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (api_key) REFERENCES api_keys(key)
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
  CREATE INDEX IF NOT EXISTS idx_transcriptions_api_key ON transcriptions(api_key);
`);

// Generate a secure API key
export function generateApiKey(): string {
  return `wsp_${crypto.randomBytes(32).toString("hex")}`;
}

// Create a new API key
export function createApiKey(name: string): {
  key: string;
  name: string;
  created_at: string;
} {
  const key = generateApiKey();
  const created_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO api_keys (key, name, created_at)
    VALUES (?, ?, ?)
  `);

  stmt.run(key, name, created_at);

  return { key, name, created_at };
}

// Validate API key
export function validateApiKey(key: string): boolean {
  const stmt = db.prepare(`
    SELECT id, is_active FROM api_keys WHERE key = ?
  `);

  const result = stmt.get(key) as { id: number; is_active: number } | undefined;

  if (!result || result.is_active === 0) {
    return false;
  }

  // Update last_used and usage_count
  const updateStmt = db.prepare(`
    UPDATE api_keys
    SET last_used = ?, usage_count = usage_count + 1
    WHERE key = ?
  `);

  updateStmt.run(new Date().toISOString(), key);

  return true;
}

// Get all API keys
export function getAllApiKeys(): Array<{
  id: number;
  key: string;
  name: string;
  created_at: string;
  last_used: string | null;
  is_active: number;
  usage_count: number;
}> {
  const stmt = db.prepare(`
    SELECT * FROM api_keys ORDER BY created_at DESC
  `);

  return stmt.all() as Array<{
    id: number;
    key: string;
    name: string;
    created_at: string;
    last_used: string | null;
    is_active: number;
    usage_count: number;
  }>;
}

// Deactivate API key
export function deactivateApiKey(key: string): boolean {
  const stmt = db.prepare(`
    UPDATE api_keys SET is_active = 0 WHERE key = ?
  `);

  const result = stmt.run(key);
  return result.changes > 0;
}

// Log transcription
export function logTranscription(
  apiKey: string,
  filename: string,
  transcript: string,
  language: string,
  duration: number,
): void {
  const stmt = db.prepare(`
    INSERT INTO transcriptions (api_key, filename, transcript, language, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    apiKey,
    filename,
    transcript,
    language,
    duration,
    new Date().toISOString(),
  );
}

// Get transcription stats
export function getStats(): {
  total_keys: number;
  active_keys: number;
  total_transcriptions: number;
} {
  const keysStmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(is_active) as active
    FROM api_keys
  `);

  const transStmt = db.prepare(`
    SELECT COUNT(*) as total FROM transcriptions
  `);

  const keys = keysStmt.get() as { total: number; active: number };
  const trans = transStmt.get() as { total: number };

  return {
    total_keys: keys.total,
    active_keys: keys.active || 0,
    total_transcriptions: trans.total,
  };
}

// Initialize with a default test key if no keys exist
const keyCount = db.prepare("SELECT COUNT(*) as count FROM api_keys").get() as {
  count: number;
};
if (keyCount.count === 0) {
  createApiKey("Default Test Key");
  // eslint-disable-next-line no-console
  console.log("Created default API key for testing");
}

export default db;
