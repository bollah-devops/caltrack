/**
 * Foods API — search + detail endpoints.
 *
 *   GET /foods/search?q=ndole&country=CM   -> list of matches with portions
 *   GET /foods/:id                          -> single food + all its portions
 *
 * This is a plain, framework-light sketch you can drop into NestJS.
 * The SQL is what matters; wire it to your pg pool / TypeORM as you prefer.
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
   * Search foods by name or alternate name. Case-insensitive substring.
   * Ranks exact prefix matches first, then contains.
   */
  @Get("search")
  async search(
    @Query("q") q: string,
    @Query("country") country = "CM",
    @Query("lang") lang = "fr",          // user's language: 'fr' | 'en'
    @Query("limit") limit = "8"
  ) {
    if (!q || q.trim().length < 2) return { results: [] };
    const term = `%${q.trim().toLowerCase()}%`;
    const prefix = `${q.trim().toLowerCase()}%`;

    // Search across BOTH language names + synonyms, so a Francophone typing
    // "arachide" and an Anglophone typing "groundnut" both find the food.
    const { rows } = await pool.query(
      `SELECT id, name_fr, name_en, aka, unit, kcal_per_unit, category,
              default_portion_label, default_portion_grams, verification_status
         FROM foods
        WHERE is_active = TRUE
          AND (country_code = $2 OR country_code IS NULL)
          AND lower(coalesce(name_fr,'') || ' ' || coalesce(name_en,'') || ' '
                    || coalesce(aka,'')) LIKE $1
        ORDER BY (lower(coalesce(name_fr,'')||coalesce(name_en,'')) LIKE $3) DESC,
                 length(name_fr) ASC
        LIMIT $4`,
      [term, country, prefix, Math.min(parseInt(limit, 10) || 8, 20)]
    );

    return {
      results: rows.map((r) => ({
        id: r.id,
        // display the name in the user's language, keep the other for reference
        name: lang === "en" ? r.name_en : r.name_fr,
        nameFr: r.name_fr,
        nameEn: r.name_en,
        unit: r.unit, // 'g' (per 100g) or 'pc' (per piece)
        kcalPerUnit: Number(r.kcal_per_unit),
        category: r.category,
        defaultPortion: r.default_portion_label
          ? { label: r.default_portion_label, grams: Number(r.default_portion_grams) }
          : null,
        verified: r.verification_status === "verified",
      })),
    };
  }

  /** Full food detail with all named portions. */
  @Get(":id")
  async detail(@Param("id") id: string) {
    const food = await pool.query(`SELECT * FROM foods WHERE id = $1`, [id]);
    if (food.rowCount === 0) return { error: "not_found" };
    const portions = await pool.query(
      `SELECT label, grams, is_default FROM food_portions WHERE food_id = $1`,
      [id]
    );
    const f = food.rows[0];
    return {
      id: f.id,
      name: f.name,
      unit: f.unit,
      kcalPerUnit: Number(f.kcal_per_unit),
      portions: portions.rows.map((p) => ({
        label: p.label,
        grams: Number(p.grams),
        isDefault: p.is_default,
      })),
      notes: f.notes,
      verified: f.verification_status === "verified",
    };
  }
}

/**
 * How the app computes calories from a search result:
 *   if unit === 'g':  kcal = Math.round(grams / 100 * kcalPerUnit)
 *   if unit === 'pc': kcal = Math.round(pieces * kcalPerUnit)
 * (Same formula Miriame's tracker already uses.)
 */
