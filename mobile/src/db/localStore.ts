/**
 * Local SQLite store — offline-first persistence for CalTrack.
 *
 * DB file: caltrack.db
 *
 * Tables:
 *   profiles   — single-row user profile + calorie target (INSERT OR REPLACE id=1)
 *   log_entries — food logs with v2 measures model snapshot
 *   day_records — per-day metadata (steps)
 */

import * as SQLite from "expo-sqlite";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  sex: string;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: string;
  goal: string;
  pace: string;
  startWeightKg: number | null;
  goalWeightKg: number | null;
  dailyTarget: number;
  maintenance: number;
  lang: string;
}

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface LogEntry {
  id: string;
  logDate: string;       // YYYY-MM-DD
  meal: Meal;
  foodId: string | null; // bundled/server food id for name resolution
  foodName: string;      // snapshot at log time (fallback)
  measureLabel: string;  // e.g. "tablespoon" or "1 louche"
  quantity: number;
  grams: number;         // computed: quantity × measure.grams
  kcal: number;          // computed: round(grams / 100 × kcalPer100)
  proteinG: number;
  carbsG: number;
  fatG: number;
  updatedAt: string;
  isDeleted: boolean;
}

export interface NewLogEntry {
  logDate: string;
  meal: Meal;
  foodId?: string | null;
  foodName: string;
  measureLabel: string;
  quantity: number;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync("caltrack.db");
    await initSchema(_db);
  }
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS profiles (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      sex             TEXT NOT NULL,
      age             INTEGER NOT NULL,
      height_cm       REAL NOT NULL,
      weight_kg       REAL NOT NULL,
      activity        TEXT NOT NULL,
      goal            TEXT NOT NULL,
      pace            TEXT NOT NULL,
      start_weight_kg REAL,
      goal_weight_kg  REAL,
      daily_target    INTEGER NOT NULL,
      maintenance     INTEGER NOT NULL,
      lang            TEXT NOT NULL DEFAULT 'fr'
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id           TEXT PRIMARY KEY,
      log_date     TEXT NOT NULL,
      meal         TEXT NOT NULL DEFAULT 'snack',
      food_name    TEXT NOT NULL,
      measure_label TEXT NOT NULL,
      quantity     REAL NOT NULL,
      grams        REAL NOT NULL,
      kcal         INTEGER NOT NULL,
      updated_at   TEXT NOT NULL,
      is_deleted   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_log_date ON log_entries(log_date);
  `);

  // Migrate: add columns if they don't exist yet
  for (const colDef of [
    "protein_g REAL DEFAULT 0",
    "carbs_g REAL DEFAULT 0",
    "fat_g REAL DEFAULT 0",
    "food_id TEXT",
  ]) {
    try {
      await db.execAsync(`ALTER TABLE log_entries ADD COLUMN ${colDef}`);
    } catch {
      // Column already exists — ignore
    }
  }

  await db.execAsync(`

    CREATE TABLE IF NOT EXISTS weight_logs (
      id         TEXT PRIMARY KEY,
      log_date   TEXT NOT NULL UNIQUE,
      weight_kg  REAL NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_weight_log_date ON weight_logs(log_date);

    CREATE TABLE IF NOT EXISTS day_records (
      id         TEXT PRIMARY KEY,
      log_date   TEXT NOT NULL UNIQUE,
      steps_done INTEGER NOT NULL DEFAULT 0,
      steps_count INTEGER,
      note       TEXT,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function saveProfile(p: Profile): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO profiles
       (id, sex, age, height_cm, weight_kg, activity, goal, pace,
        start_weight_kg, goal_weight_kg, daily_target, maintenance, lang)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.sex, p.age, p.heightCm, p.weightKg,
      p.activity, p.goal, p.pace,
      p.startWeightKg ?? null, p.goalWeightKg ?? null,
      p.dailyTarget, p.maintenance, p.lang,
    ]
  );
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM profiles WHERE id = 1`
  );
  if (!row) return null;
  return {
    sex:           row.sex,
    age:           row.age,
    heightCm:      row.height_cm,
    weightKg:      row.weight_kg,
    activity:      row.activity,
    goal:          row.goal,
    pace:          row.pace,
    startWeightKg: row.start_weight_kg,
    goalWeightKg:  row.goal_weight_kg,
    dailyTarget:   row.daily_target,
    maintenance:   row.maintenance,
    lang:          row.lang,
  };
}

// ─── Log entries ──────────────────────────────────────────────────────────────

function uuid(): string {
  // RFC-4122 v4 UUID without crypto (good enough for offline client IDs)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function addLogEntry(entry: NewLogEntry): Promise<LogEntry> {
  const db = await getDb();
  const id = uuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO log_entries
       (id, log_date, meal, food_id, food_name, measure_label, quantity, grams, kcal,
        protein_g, carbs_g, fat_g, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, entry.logDate, entry.meal, entry.foodId ?? null, entry.foodName,
      entry.measureLabel, entry.quantity, entry.grams, entry.kcal,
      entry.proteinG, entry.carbsG, entry.fatG, now,
    ]
  );
  return { ...entry, id, foodId: entry.foodId ?? null, updatedAt: now, isDeleted: false };
}

export async function getEntriesForDate(logDate: string): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM log_entries
      WHERE log_date = ? AND is_deleted = 0
      ORDER BY updated_at ASC`,
    [logDate]
  );
  return rows.map(rowToEntry);
}

export async function deleteLogEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE log_entries SET is_deleted = 1, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

export async function getTotalsForDate(
  logDate: string
): Promise<{ kcal: number; count: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT coalesce(sum(kcal), 0) as kcal, count(*) as count
       FROM log_entries WHERE log_date = ? AND is_deleted = 0`,
    [logDate]
  );
  return { kcal: row?.kcal ?? 0, count: row?.count ?? 0 };
}

function rowToEntry(r: any): LogEntry {
  return {
    id:           r.id,
    logDate:      r.log_date,
    meal:         r.meal as Meal,
    foodId:       r.food_id ?? null,
    foodName:     r.food_name,
    measureLabel: r.measure_label,
    quantity:     r.quantity,
    grams:        r.grams,
    kcal:         r.kcal,
    proteinG:     r.protein_g ?? 0,
    carbsG:       r.carbs_g ?? 0,
    fatG:         r.fat_g ?? 0,
    updatedAt:    r.updated_at,
    isDeleted:    r.is_deleted === 1,
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface DaySummary {
  date: string;       // YYYY-MM-DD
  kcal: number;
  entryCount: number;
  stepsDone: boolean;
}

/**
 * Returns up to `limit` past days that have at least one log entry,
 * newest first. Excludes today (TodayScreen covers that).
 */
export async function getHistoryDays(limit = 90): Promise<DaySummary[]> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];

  const kcalRows = await db.getAllAsync<any>(
    `SELECT log_date, sum(kcal) AS kcal, count(*) AS entry_count
       FROM log_entries
      WHERE is_deleted = 0 AND log_date < ?
      GROUP BY log_date
      ORDER BY log_date DESC
      LIMIT ?`,
    [today, limit]
  );

  if (kcalRows.length === 0) return [];

  const dates = kcalRows.map((r: any) => r.log_date);
  const placeholders = dates.map(() => "?").join(",");
  const stepsRows = await db.getAllAsync<any>(
    `SELECT log_date, steps_done
       FROM day_records
      WHERE log_date IN (${placeholders}) AND is_deleted = 0`,
    dates
  );

  const stepsMap: Record<string, boolean> = {};
  for (const r of stepsRows) stepsMap[r.log_date] = r.steps_done === 1;

  return kcalRows.map((r: any) => ({
    date:       r.log_date,
    kcal:       r.kcal,
    entryCount: r.entry_count,
    stepsDone:  stepsMap[r.log_date] ?? false,
  }));
}

// ─── Day records (steps) ──────────────────────────────────────────────────────

export async function getStepsForDate(
  logDate: string
): Promise<{ stepsDone: boolean; stepsCount: number | null } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM day_records WHERE log_date = ? AND is_deleted = 0`,
    [logDate]
  );
  if (!row) return null;
  return { stepsDone: row.steps_done === 1, stepsCount: row.steps_count };
}

export async function setStepsDone(
  logDate: string,
  done: boolean
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO day_records (id, log_date, steps_done, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(log_date) DO UPDATE SET steps_done = ?, updated_at = ?`,
    [uuid(), logDate, done ? 1 : 0, now, done ? 1 : 0, now]
  );
}

// ─── Steps streak ─────────────────────────────────────────────────────────────

/** Counts consecutive days (including today) where steps_done = 1. */
export async function getStepsStreak(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ log_date: string }>(
    `SELECT log_date FROM day_records
      WHERE steps_done = 1 AND is_deleted = 0
      ORDER BY log_date DESC LIMIT 60`
  );
  if (rows.length === 0) return 0;
  let streak = 0;
  const base = new Date();
  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(base);
    expected.setDate(base.getDate() - i);
    if (rows[i].log_date === expected.toISOString().split("T")[0]) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ─── Weight logs ──────────────────────────────────────────────────────────────

export interface WeightLog {
  id: string;
  logDate: string;
  weightKg: number;
  updatedAt: string;
}

/** Upserts a weight log for today. */
export async function addWeightLog(weightKg: number): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO weight_logs (id, log_date, weight_kg, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(log_date) DO UPDATE SET weight_kg = ?, updated_at = ?`,
    [uuid(), today, weightKg, now, weightKg, now]
  );
}

/** Returns the most recent weight logs, newest first. */
export async function getWeightLogs(limit = 50): Promise<WeightLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM weight_logs WHERE is_deleted = 0
      ORDER BY log_date DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id:       r.id,
    logDate:  r.log_date,
    weightKg: r.weight_kg,
    updatedAt: r.updated_at,
  }));
}

/** Soft-delete a weight log entry. */
export async function deleteWeightLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE weight_logs SET is_deleted = 1, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

// ─── Daily kcal history (for bar chart) ───────────────────────────────────────

export interface DayKcal {
  date: string;  // YYYY-MM-DD
  kcal: number;
}

/**
 * Returns the last `days` calendar days (including today) with their kcal
 * totals. Days with no entries return kcal=0. Ordered oldest→newest.
 */
export async function getDailyKcalHistory(days = 14): Promise<DayKcal[]> {
  const db = await getDb();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  const placeholders = dates.map(() => "?").join(",");
  const rows = await db.getAllAsync<any>(
    `SELECT log_date, sum(kcal) AS kcal
       FROM log_entries
      WHERE is_deleted = 0 AND log_date IN (${placeholders})
      GROUP BY log_date`,
    dates
  );
  const kcalMap: Record<string, number> = {};
  for (const r of rows) kcalMap[r.log_date] = r.kcal;
  return dates.map((date) => ({ date, kcal: kcalMap[date] ?? 0 }));
}
