/**
 * Upsert cities from docs/indian_cities_by_region.csv into rm.city_regions.
 * Usage: node scripts/import-city-regions.mjs [optional-csv-path]
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultPath = join(__dirname, "../docs/indian_cities_by_region.csv");
const csvPath = process.argv[2] ?? defaultPath;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

if (!existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`,
);

const REGION_MAP = {
  North: "north",
  East: "east",
  West: "west",
  South: "south",
};

/** City,State,Region — state may contain commas; region is always last column. */
function parseCsvLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  if (parts.length < 3) return null;
  const regionLabel = parts[parts.length - 1]?.trim();
  const region = REGION_MAP[regionLabel];
  if (!region) return null;
  const city = parts[0]?.trim();
  const state = parts.slice(1, -1).join(",").trim();
  if (!city || !state) return null;
  return { city, state, region };
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row) rows.push(row);
  }
  return rows;
}

/** Legacy names still used on leads / spoken by brides. */
const CITY_ALIASES = [
  { alias: "Gurgaon", canonical: "Gurugram" },
  { alias: "Bangalore", canonical: "Bengaluru" },
  { alias: "Vizag", canonical: "Visakhapatnam" },
  { alias: "Calicut", canonical: "Kozhikode" },
  { alias: "Bombay", canonical: "Mumbai" },
  { alias: "Aurangabad", canonical: "Aurangabad (Chhatrapati Sambhajinagar)" },
  { alias: "Allahabad", canonical: "Prayagraj (Allahabad)" },
  { alias: "Mysore", canonical: "Mysuru" },
  { alias: "Trivandrum", canonical: "Thiruvananthapuram" },
  { alias: "Cochin", canonical: "Kochi" },
  { alias: "Baroda", canonical: "Vadodara" },
  { alias: "Pondicherry", canonical: "Puducherry" },
];

try {
  const csv = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csv);
  const byCity = new Map(rows.map((r) => [r.city.toLowerCase(), r]));

  let inserted = 0;
  let updated = 0;

  for (const { city, state, region } of rows) {
    const [existing] = await sql`
      SELECT id FROM city_regions WHERE city = ${city}
    `;
    if (existing) {
      await sql`
        UPDATE city_regions SET
          region = ${region}::region,
          state = ${state}
        WHERE city = ${city}
      `;
      updated++;
    } else {
      await sql`
        INSERT INTO city_regions (city, region, state)
        VALUES (${city}, ${region}::region, ${state})
      `;
      inserted++;
    }
  }

  let aliasesAdded = 0;
  for (const { alias, canonical } of CITY_ALIASES) {
    const target =
      byCity.get(canonical.toLowerCase()) ??
      rows.find((r) => r.city.toLowerCase() === canonical.toLowerCase());
    if (!target) continue;

    const [existing] = await sql`SELECT id FROM city_regions WHERE city = ${alias}`;
    if (existing) {
      await sql`
        UPDATE city_regions SET
          region = ${target.region}::region,
          state = ${target.state}
        WHERE city = ${alias}
      `;
    } else {
      await sql`
        INSERT INTO city_regions (city, region, state)
        VALUES (${alias}, ${target.region}::region, ${target.state})
      `;
      aliasesAdded++;
    }
  }

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM city_regions`;
  const byRegion = await sql`
    SELECT region::text AS region, COUNT(*)::int AS n
    FROM city_regions GROUP BY region ORDER BY region
  `;

  console.log(`CSV: ${csvPath}`);
  console.log(
    `City import: ${rows.length} rows, ${inserted} inserted, ${updated} updated, ${aliasesAdded} aliases added/updated`,
  );
  console.log(`Total in city_regions: ${count}`);
  for (const r of byRegion) {
    console.log(`  ${r.region}: ${r.n}`);
  }
} finally {
  await sql.end();
}
