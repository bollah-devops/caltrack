/**
 * Food search API — online with offline fallback.
 *
 * Online:  GET /foods/search and GET /foods/:id
 * Offline: filter bundledFoods.json with the same 3-tier ranking used by
 *          the backend (prefix > word-boundary > substring), accent-insensitive.
 *
 * computeKcal() is the canonical calorie formula (v2 measures model):
 *   grams = quantity × measure.grams
 *   kcal  = round(grams / 100 × kcalPer100)
 */

import type { Lang } from "../lib/i18n";
import type { CustomFood } from "../db/localStore";
import rawBundled from "./bundledFoods.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FoodMeasure {
  label: string;
  grams: number;
  sortOrder: number;
}

export interface FoodItem {
  id: string;
  name: string;        // display name, lang-aware
  nameFr: string;
  nameEn: string | null;
  aka: string | null;
  basis: "100g" | "100ml";
  kcalPer100: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  category: string | null;
  verified: boolean;
  measures: FoodMeasure[];
}

// ─── Calorie formula ──────────────────────────────────────────────────────────

/** The v2 two-step formula. Use this everywhere — never inline it. */
export function computeKcal(
  quantity: number,
  measureGrams: number,
  kcalPer100: number
): number {
  return Math.round((quantity * measureGrams) / 100 * kcalPer100);
}

/** Same formula for macros — returns grams of the macro, rounded to 1 dp. */
export function computeMacros(
  quantity: number,
  measureGrams: number,
  valuePer100: number
): number {
  return Math.round((quantity * measureGrams) / 100 * valuePer100 * 10) / 10;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const FETCH_TIMEOUT_MS = 4000;

// ─── Online search ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchFoods(
  q: string,
  lang: Lang = "fr",
  country = "CM",
  limit = 8
): Promise<FoodItem[]> {
  try {
    const url = `${API_BASE}/foods/search?q=${encodeURIComponent(q)}&lang=${lang}&country=${country}&limit=${limit}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results as FoodItem[];
  } catch {
    // Network unavailable or timed out — fall back to bundled data
    return searchBundled(q, lang, limit);
  }
}

export async function getFood(
  id: string,
  lang: Lang = "fr"
): Promise<FoodItem | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/foods/${id}?lang=${lang}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) return null;
    return data as FoodItem;
  } catch {
    const f = (rawBundled as any[]).find((b) => b.id === id);
    return f ? toBundledItem(f, lang) : null;
  }
}

// ─── Offline / bundled search ─────────────────────────────────────────────────

/**
 * Accent-fold: strip common diacritics so "oeuf" matches "œuf",
 * "ndole" matches "ndolé", etc. Without the unaccent PG extension
 * client-side, we do a best-effort JS fold.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

function matchRank(food: any, q: string): number {
  const fr  = fold(food.nameFr ?? "");
  const en  = fold(food.nameEn ?? "");
  const aka = fold(food.aka ?? "");
  const all = `${fr} ${en} ${aka}`;

  if (!all.includes(q)) return 0;                    // no match
  if (fr.startsWith(q) || en.startsWith(q)) return 3; // prefix (best)
  if (fr.includes(` ${q}`) || en.includes(` ${q}`)) return 2; // word boundary
  return 1;                                            // substring (weakest)
}

function searchBundled(q: string, lang: Lang, limit: number): FoodItem[] {
  const query = fold(q.trim());
  if (query.length < 2) return [];

  return (rawBundled as any[])
    .map((f) => ({ f, rank: matchRank(f, query) }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) =>
      b.rank - a.rank || a.f.nameFr.length - b.f.nameFr.length
    )
    .slice(0, limit)
    .map(({ f }) => toBundledItem(f, lang));
}

// ─── Name resolution (for display of stored log entries) ──────────────────────

/**
 * Given a food_id stored on a log entry, return the correct display name in
 * the user's current language. Falls back to the stored name snapshot when
 * the food_id is absent (custom entry) or not found in the bundled DB.
 */
export function resolveFoodName(
  foodId: string | null | undefined,
  fallback: string,
  lang: Lang
): string {
  if (!foodId) return fallback;
  const raw = (rawBundled as any[]).find((f) => f.id === foodId);
  if (!raw) return fallback;
  return lang === "en" ? (raw.nameEn || raw.nameFr) : raw.nameFr;
}

// ─── Barcode lookup ────────────────────────────────────────────────────────────

export type BarcodeResult =
  | { type: "found"; food: FoodItem }
  | { type: "not_found"; barcode: string }
  | { type: "offline";   barcode: string };

const OFF_BASE = "https://world.openfoodfacts.org/api/v0/product";
const OFF_TIMEOUT_MS = 6000;

/** Convert a CustomFood (user-created or cached OFF result) to a FoodItem. */
export function customFoodToItem(cf: CustomFood, lang: Lang): FoodItem {
  return {
    id:         `custom_${cf.id}`,
    name:       lang === "en" ? (cf.nameEn || cf.nameFr) : cf.nameFr,
    nameFr:     cf.nameFr,
    nameEn:     cf.nameEn ?? null,
    aka:        null,
    basis:      "100g",
    kcalPer100: cf.kcalPer100,
    proteinG:   cf.proteinPer100,
    carbsG:     cf.carbsPer100,
    fatG:       cf.fatPer100,
    category:   null,
    verified:   false,
    measures:   [{ label: "gram", grams: 1, sortOrder: 0 }],
  };
}

/**
 * Barcode resolution order:
 *   1. Local custom_foods table (instant, offline)
 *   2. Open Food Facts API (requires connectivity)
 * Returns "offline" on network error, "not_found" if OFF has no entry.
 */
export async function lookupBarcode(
  barcode: string,
  lang: Lang
): Promise<BarcodeResult> {
  // Lazy-import localStore to avoid circular dep at module init
  const { getCustomFoodByBarcode } = await import("../db/localStore");

  const local = await getCustomFoodByBarcode(barcode);
  if (local) return { type: "found", food: customFoodToItem(local, lang) };

  // Try Open Food Facts
  let data: any;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${OFF_BASE}/${barcode}.json`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { type: "not_found", barcode };
    data = await res.json();
  } catch {
    return { type: "offline", barcode };
  }

  if (data.status !== 1 || !data.product) return { type: "not_found", barcode };

  const p = data.product;
  const n = p.nutriments ?? {};
  const kcal = n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0;

  const food: FoodItem = {
    id:         `off_${barcode}`,
    name:       lang === "en"
      ? (p.product_name_en || p.product_name || p.product_name_fr || barcode)
      : (p.product_name_fr || p.product_name || barcode),
    nameFr:     p.product_name_fr || p.product_name || barcode,
    nameEn:     p.product_name_en || p.product_name || null,
    aka:        null,
    basis:      "100g",
    kcalPer100: typeof kcal === "number" ? Math.round(kcal) : 0,
    proteinG:   n.proteins_100g ?? 0,
    carbsG:     n.carbohydrates_100g ?? 0,
    fatG:       n.fat_100g ?? 0,
    category:   null,
    verified:   false,
    measures:   [{ label: "gram", grams: 1, sortOrder: 0 }],
  };
  return { type: "found", food };
}

function toBundledItem(f: any, lang: Lang): FoodItem {
  return {
    id:         f.id,
    name:       lang === "en" ? (f.nameEn || f.nameFr) : f.nameFr,
    nameFr:     f.nameFr,
    nameEn:     f.nameEn ?? null,
    aka:        f.aka ?? null,
    basis:      f.basis,
    kcalPer100: f.kcalPer100,
    proteinG:   f.proteinG ?? 0,
    carbsG:     f.carbsG ?? 0,
    fatG:       f.fatG ?? 0,
    category:   f.category ?? null,
    verified:   f.verified ?? false,
    measures:   f.measures,
  };
}
