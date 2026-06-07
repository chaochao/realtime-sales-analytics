import Database from "better-sqlite3";

const g = globalThis as unknown as { __db?: Database.Database };

function init(): Database.Database {
  const db = new Database(process.env.SQLITE_PATH ?? "sales.db");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      customerName TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      amountUsd REAL NOT NULL,
      region TEXT NOT NULL,
      salesRep TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      field TEXT NOT NULL,
      resolvedValue TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(term, field)
    );
  `);
  return db;
}

export const db = g.__db ?? (g.__db = init());
