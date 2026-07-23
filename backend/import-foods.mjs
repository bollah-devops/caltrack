/**
 * Seed importer — loads seed_cameroon_v2.csv into `foods` + `food_measures`.
 *
 * Run once after the schema is loaded:
 *   node import-foods.mjs [path/to/csv]
 *
 * Requires: npm install pg csv-parse
 * Env: DATABASE_URL=postgres://calorie:devpassword@localhost:5432/calorie
 *
 * Measures column format: "label:grams|label:grams"
 *   e.g. "gram:1|tablespoon:15|cup:240|ladle:150"
 * Each entry becomes one food_measures row; sort_order = position index.
 *
 * Calorie math (for reference, not done here):
 *   grams = quantity * measure.grams
 *   kcal  = Math.round(grams / 100 * kcal_per_100)
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import pg from "pg";

const csvPath =
  process.argv[2] || "./migrations/seed_cameroon_v2.csv";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://calorie:devpassword@localhost:5432/calorie";

function normalizeStatus(s) {
  if (!s) return "estimate";
  return s.toLowerCase().includes("verified") ? "verified" : "estimate";
}

/**
 * Parse the measures string into an array of {label, grams, sort_order}.
 * Input:  "gram:1|tablespoon:15|cup:240|ladle:150"
 * Output: [{label:'gram',grams:1,sort_order:0}, {label:'tablespoon',grams:15,sort_order:1}, ...]
 */
function parseMeasures(raw) {
  if (!raw || !raw.trim()) return [];
  return raw
    .split("|")
    .map((entry, i) => {
      const colonIdx = entry.lastIndexOf(":");
      if (colonIdx === -1) return null;
      const label = entry.slice(0, colonIdx).trim();
      const grams = parseFloat(entry.slice(colonIdx + 1).trim());
      if (!label || Number.isNaN(grams)) return null;
      return { label, grams, sort_order: i };
    })
    .filter(Boolean);
}

async function main() {
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`Connected. Importing ${rows.length} foods from ${csvPath}...`);

  let importedFoods = 0;
  let importedMeasures = 0;
  let skipped = 0;

  for (const r of rows) {
    const nameFr = (r.name_fr || "").trim();
    const kcalPer100 = parseFloat(r.kcal_per_100);

    if (!nameFr || Number.isNaN(kcalPer100)) {
      console.warn(`  Skipping row: name_fr="${r.name_fr}" kcal_per_100="${r.kcal_per_100}"`);
      skipped++;
      continue;
    }

    const basis = (r.basis || "100g").trim();
    if (basis !== "100g" && basis !== "100ml") {
      console.warn(`  Skipping row "${nameFr}": unknown basis "${basis}"`);
      skipped++;
      continue;
    }

    const res = await client.query(
      `INSERT INTO foods
         (name, name_fr, name_en, aka, country_code, region, category,
          basis, kcal_per_100, verification_status, notes)
       VALUES ($1,$2,$3,$4,'CM',$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        nameFr,                                   // name = French primary
        nameFr,
        (r.name_en || "").trim() || null,
        (r.search_aka || "").trim() || null,
        (r.region || "").trim() || null,
        (r.category || "").trim() || null,
        basis,
        kcalPer100,
        normalizeStatus(r.status),
        (r.notes || "").trim() || null,
      ]
    );
    const foodId = res.rows[0].id;
    importedFoods++;

    // Explode the measures column into food_measures rows
    const measures = parseMeasures(r.measures);
    for (const m of measures) {
      await client.query(
        `INSERT INTO food_measures (food_id, label, grams, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [foodId, m.label, m.grams, m.sort_order]
      );
      importedMeasures++;
    }
  }

  const { rows: count } = await client.query("SELECT count(*) FROM foods");
  console.log(
    `Done. Imported ${importedFoods} foods, ${importedMeasures} measures.` +
    (skipped ? ` Skipped ${skipped} invalid rows.` : "") +
    ` Total foods in DB: ${count[0].count}`
  );
  await client.end();
}

main().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
