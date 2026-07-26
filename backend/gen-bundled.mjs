/**
 * gen-bundled.mjs — regenerate mobile/src/api/bundledFoods.json from the seed CSV.
 *
 * Usage:
 *   node gen-bundled.mjs [path/to/csv] [path/to/output.json]
 *
 * Defaults:
 *   CSV:  ./migrations/seed_v9.csv
 *   JSON: ../mobile/src/api/bundledFoods.json
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const csvPath = process.argv[2] || "./migrations/seed_v9.csv";
const outPath =
  process.argv[3] || "../mobile/src/api/bundledFoods.json";

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
      return { label, grams, sortOrder: i };
    })
    .filter(Boolean);
}

const raw = fs.readFileSync(csvPath, "utf8");
const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

let idx = 0;
const foods = rows
  .filter((r) => r.name_fr && r.kcal_per_100 && !Number.isNaN(parseFloat(r.kcal_per_100)))
  .map((r) => {
    idx++;
    return {
      id: `bundled_${String(idx).padStart(3, "0")}`,
      nameFr: r.name_fr.trim(),
      nameEn: r.name_en?.trim() || null,
      aka: r.search_aka?.trim() || null,
      basis: r.basis?.trim() || "100g",
      kcalPer100: parseFloat(r.kcal_per_100),
      proteinG: Number.isNaN(parseFloat(r.protein_g)) ? 0 : parseFloat(r.protein_g),
      carbsG: Number.isNaN(parseFloat(r.carbs_g)) ? 0 : parseFloat(r.carbs_g),
      fatG: Number.isNaN(parseFloat(r.fat_g)) ? 0 : parseFloat(r.fat_g),
      category: r.category?.trim() || null,
      verified:
        r.status?.toLowerCase().startsWith("verified") &&
        !r.status?.toLowerCase().includes("estimate"),
      measures: parseMeasures(r.measures),
    };
  });

const dir = path.dirname(outPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(foods, null, 2));
console.log(`Generated ${foods.length} foods → ${outPath}`);
