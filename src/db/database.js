const Database = require("better-sqlite3");
const path = require("path");
const logger = require("../utils/logger");

const DB_PATH = path.join(__dirname, "../../data/autoposter.db");

let db;

function getDb() {
  if (!db) {
    const fs = require("fs");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initTables();
    logger.info("Database initialized");
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK(platform IN ('reddit', 'tiktok')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'posted', 'failed')),
      payload TEXT NOT NULL,
      scheduled_at TEXT,
      posted_at TEXT,
      result TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      payload TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
  `);
}

module.exports = { getDb };
