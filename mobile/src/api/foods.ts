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

function toBundledItem(f: any, lang: Lang): FoodItem {
  return {
    id:         f.id,
    name:       lang === "en" ? (f.nameEn || f.nameFr) : f.nameFr,
    nameFr:     f.nameFr,
    nameEn:     f.nameEn ?? null,
    aka:        f.aka ?? null,
    basis:      f.basis,
    kcalPer100: f.kcalPer100,
    category:   f.category ?? null,
    verified:   f.verified ?? false,
    measures:   f.measures,
  };
}
