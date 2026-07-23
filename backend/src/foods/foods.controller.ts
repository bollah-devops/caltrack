/**
 * Foods API — bilingual search + detail endpoints (v2 measures model).
 *
 *   GET /foods/search?q=ndole&lang=fr&country=CM
 *   GET /foods/:id
 *
 * Calorie math (done in the app, not here):
 *   grams = quantity * measure.grams
 *   kcal  = Math.round(grams / 100 * kcalPer100)
 */

import { Controller, Get, Query, Param } from "@nestjs/common";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://calorie:devpassword@localhost:5432/calorie",
});

@Controller("foods")
export class FoodsController {
  /**
   * Bilingual food search. A user typing "groundnut" or "arachide" finds the
   * same food because we search name_fr, name_en, AND aka in one predicate.
   *
   * Measures are returned in the same query via json_agg so the app can build
   * its measure picker entirely from this response with no extra requests.
   */
  @Get("search")
  async search(
    @Query("q") q: string,
    @Query("lang") lang = "fr",
    @Query("country") country = "CM",
    @Query("limit") limit = "8",
  ) {
    if (!q || q.trim().length < 2) return { results: [] };

    // All pattern matching goes through unaccent(lower()) so that:
    //   - "oeuf" matches "œuf"  (ligature → two chars)
    //   - "ndole" matches "ndolé"
    // Patterns are passed as literals; unaccent() is applied in SQL.
    const raw    = q.trim();
    const term   = `%${raw}%`;      // $1 — substring (widest net)
    const prefix = `${raw}%`;       // $3 — name starts with query  (rank 1)
    const word   = `% ${raw}%`;     // $4 — word inside name starts with query (rank 2)
    const cap    = Math.min(parseInt(limit, 10) || 8, 20);

    // Ranking tiers (CASE evaluated after GROUP BY via subquery):
    //   1 — name_fr or name_en starts with the query  → best
    //   2 — a word inside name_fr/name_en starts with query (word boundary)
    //   3 — substring match anywhere (name or synonym)
    // Within each tier: shorter name_fr first.
    const { rows } = await pool.query(
      `SELECT
         f.id,
         f.name_fr,
         f.name_en,
         f.basis,
         f.kcal_per_100,
         f.protein_g,
         f.carbs_g,
         f.fat_g,
         f.category,
         f.verification_status,
         COALESCE(
           json_agg(
             json_build_object(
               'label',     m.label,
               'grams',     m.grams,
               'sortOrder', m.sort_order
             ) ORDER BY m.sort_order
           ) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS measures,
         CASE
           WHEN unaccent(lower(coalesce(f.name_fr,''))) LIKE unaccent(lower($3))
             OR unaccent(lower(coalesce(f.name_en,''))) LIKE unaccent(lower($3))
           THEN 1
           WHEN unaccent(lower(coalesce(f.name_fr,''))) LIKE unaccent(lower($4))
             OR unaccent(lower(coalesce(f.name_en,''))) LIKE unaccent(lower($4))
           THEN 2
           ELSE 3
         END AS rank
       FROM foods f
       LEFT JOIN food_measures m ON m.food_id = f.id
       WHERE f.is_active = TRUE
         AND (f.country_code = $2 OR f.country_code IS NULL)
         AND (
               unaccent(lower(coalesce(f.name_fr,''))) LIKE unaccent(lower($1))
            OR unaccent(lower(coalesce(f.name_en,''))) LIKE unaccent(lower($1))
            OR unaccent(lower(coalesce(f.aka,'')))     LIKE unaccent(lower($1))
         )
       GROUP BY f.id
       ORDER BY rank ASC, length(f.name_fr) ASC
       LIMIT $5`,
      [term, country, prefix, word, cap],
    );

    return {
      results: rows.map((r) => formatFood(r, lang)),
    };
  }

  /** Full food detail with all measures. */
  @Get(":id")
  async detail(@Param("id") id: string, @Query("lang") lang = "fr") {
    const { rows } = await pool.query(
      `SELECT
         f.*,
         COALESCE(
           json_agg(
             json_build_object(
               'label',     m.label,
               'grams',     m.grams,
               'sortOrder', m.sort_order
             ) ORDER BY m.sort_order
           ) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS measures
       FROM foods f
       LEFT JOIN food_measures m ON m.food_id = f.id
       WHERE f.id = $1
       GROUP BY f.id`,
      [id],
    );

    if (rows.length === 0) return { error: "not_found" };
    return formatFood(rows[0], lang);
  }
}

function formatFood(r: any, lang: string) {
  return {
    id:          r.id,
    name:        lang === "en" ? (r.name_en || r.name_fr) : r.name_fr,
    nameFr:      r.name_fr,
    nameEn:      r.name_en ?? null,
    basis:       r.basis,               // '100g' | '100ml'
    kcalPer100:  Number(r.kcal_per_100),
    proteinG:    Number(r.protein_g) || 0,
    carbsG:      Number(r.carbs_g) || 0,
    fatG:        Number(r.fat_g) || 0,
    category:    r.category ?? null,
    verified:    r.verification_status === "verified",
    measures:    (r.measures as any[]).map((m) => ({
      label:     m.label,
      grams:     Number(m.grams),
      sortOrder: m.sortOrder,
    })),
    notes:       r.notes ?? null,
  };
}
