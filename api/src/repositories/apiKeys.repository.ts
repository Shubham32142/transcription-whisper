import Database from "better-sqlite3";
import path from "node:path";
import type { ApiKeyRecord } from "../types";
import { config } from "../config";

const dbPath = path.resolve(process.cwd(), config.db.path);
const db = new Database(dbPath);

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

  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
`);

/**
 * API Keys Repository - Handles all database queries for API keys
 */
export class ApiKeysRepository {
  /**
   * Get API key record by key value
   */
  static findByKey(key: string): ApiKeyRecord | undefined {
    const stmt = db.prepare("SELECT * FROM api_keys WHERE key = ?");
    return stmt.get(key) as ApiKeyRecord | undefined;
  }

  /**
   * Get all API keys
   */
  static findAll(): ApiKeyRecord[] {
    const stmt = db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC");
    return stmt.all() as ApiKeyRecord[];
  }

  /**
   * Create new API key
   */
  static create(key: string, name: string): ApiKeyRecord {
    const created_at = new Date().toISOString();
    const stmt = db.prepare(
      "INSERT INTO api_keys (key, name, created_at) VALUES (?, ?, ?)"
    );
    stmt.run(key, name, created_at);

    const result = this.findByKey(key);
    if (!result) throw new Error("Failed to create API key");
    return result;
  }

  /**
   * Deactivate an API key
   */
  static deactivate(key: string): boolean {
    const stmt = db.prepare("UPDATE api_keys SET is_active = 0 WHERE key = ?");
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * Increment usage count and update last_used
   */
  static recordUsage(key: string): void {
    const stmt = db.prepare(
      "UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE key = ?"
    );
    stmt.run(new Date().toISOString(), key);
  }

  /**
   * Get usage statistics
   */
  static getStats(): { total: number; active: number } {
    const stmt = db.prepare(
      "SELECT COUNT(*) as total, SUM(is_active) as active FROM api_keys"
    );
    const result = stmt.get() as { total: number; active: number | null };
    return {
      total: result.total,
      active: result.active || 0,
    };
  }
}

/**
 * Ensure at least one API key exists for testing
 */
function ensureDefaultKey() {
  const stmt = db.prepare("SELECT COUNT(*) as count FROM api_keys");
  const result = stmt.get() as { count: number };
  if (result.count === 0) {
    const key = `wsp_${require("crypto").randomBytes(32).toString("hex")}`;
    ApiKeysRepository.create(key, "Default Test Key");
    console.log("✓ Created default API key for testing");
  }
}

ensureDefaultKey();

export default db;
