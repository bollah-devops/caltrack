/**
 * Seed importer — loads the Cameroon food CSV into the `foods` table
 * and explodes the local_portion column into `food_portions`.
 *
 * Run once after the schema is loaded:
 *   node import-foods.mjs ./migrations/seed_cameroon_bilingual.csv
 *
 * Requires: npm install pg csv-parse
 * Env: DATABASE_URL=postgres://calorie:devpassword@localhost:5432/calorie
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import pg from "pg";

const csvPath = process.argv[2] || "./migrations/seed_cameroon_bilingual.csv";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://calorie:devpassword@localhost:5432/calorie";

// CSV columns:
// name,aka,region_or_community,category,unit,kcal,local_portion,
// portion_g_est,portion_kcal_est,status,notes
function normalizeStatus(s) {
  if (!s) return "estimate";
  return s.toLowerCase().includes("verified") ? "verified" : "estimate";
}

async function main() {
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`Connected. Importing ${rows.length} foods from ${csvPath}...`);

  let imported = 0;
  for (const r of rows) {
    const unit = (r.unit || "g").trim() === "pc" ? "pc" : "g";
    const kcal = parseFloat(r.kcal);
    if (!r.name || Number.isNaN(kcal)) continue;

    // Bilingual columns: name_fr, name_en, search_aka
    // `name` = French by default (primary market); name_fr/name_en both stored.
    const nameFr = r.name_fr || r.name;
    const nameEn = r.name_en || r.name;
    const res = await client.query(
      `INSERT INTO foods
        (name, name_fr, name_en, aka, country_code, region, category, unit,
         kcal_per_unit, default_portion_label, default_portion_grams,
         verification_status, notes)
       VALUES ($1,$2,$3,$4,'CM',$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        nameFr,                          // name defaults to French
        nameFr,
        nameEn,
        r.search_aka || r.aka || null,   // synonyms/spellings for search
        r.region_or_community || null,
        r.category || null,
        unit,
        kcal,
        r.local_portion || null,
        r.portion_g_est ? parseFloat(r.portion_g_est) : null,
        normalizeStatus(r.status),
        r.notes || null,
      ]
    );
    const foodId = res.rows[0].id;

    // explode the default local portion into food_portions (if grams known)
    if (r.local_portion && r.portion_g_est) {
      await client.query(
        `INSERT INTO food_portions (food_id, label, grams, is_default)
         VALUES ($1,$2,$3,TRUE)`,
        [foodId, r.local_portion, parseFloat(r.portion_g_est)]
      );
    }
    imported++;
  }

  const { rows: count } = await client.query("SELECT count(*) FROM foods");
  console.log(`Done. Imported ${imported}. Total foods in DB: ${count[0].count}`);
  await client.end();
}

main().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
