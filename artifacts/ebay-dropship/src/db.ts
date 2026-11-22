import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0
);

-- One row per supplier variant we consider selling.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  supplier TEXT NOT NULL,
  supplier_product_id TEXT NOT NULL,
  supplier_variant_id TEXT NOT NULL,
  keyword TEXT,
  title TEXT NOT NULL,
  description TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  cost REAL NOT NULL,
  shipping_cost REAL NOT NULL,
  shipping_days TEXT,
  logistic_name TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL,
  profit REAL NOT NULL,
  competitor_count INTEGER,
  competitor_median REAL,
  score REAL NOT NULL DEFAULT 0,
  score_notes TEXT,
  -- candidate | approved | listed | paused | rejected | ended | error
  status TEXT NOT NULL DEFAULT 'candidate',
  ebay_title TEXT,
  ebay_description TEXT,
  ebay_aspects TEXT,
  ebay_category_id TEXT,
  ebay_offer_id TEXT,
  ebay_listing_id TEXT,
  last_error TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ebay_order_id TEXT NOT NULL UNIQUE,
  buyer TEXT,
  total REAL,
  currency TEXT,
  ship_to TEXT NOT NULL,
  line_items TEXT NOT NULL,
  -- new | supplier_ordered | awaiting_payment | shipped | needs_attention | cancelled
  status TEXT NOT NULL DEFAULT 'new',
  supplier_order_id TEXT,
  supplier_cost REAL,
  tracking_number TEXT,
  carrier TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export type Level = "info" | "warn" | "error";

export function log(db: DB, level: Level, area: string, message: string): void {
  db.prepare("INSERT INTO logs (level, area, message) VALUES (?, ?, ?)").run(level, area, message);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${area}: ${message}`;
  if (level === "error") console.error(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}
