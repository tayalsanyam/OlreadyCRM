import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { DEMO_PASSWORD } from "@/lib/demo-users";
import { seedDemoUsers } from "@/lib/seed-users";

loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(`${url}${sep}options=-c%20search_path%3Drm`, {
  transform: postgres.camel,
  ssl: url.includes("supabase.co") ? "require" : false,
  max: 1,
  idle_timeout: 10,
});

async function main() {
  const { count } = await seedDemoUsers(sql);
  console.log(`Seed users OK (${count} accounts, password: ${DEMO_PASSWORD})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
