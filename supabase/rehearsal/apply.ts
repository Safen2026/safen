// Applies a single .sql file to SUPABASE_DB_URL.
//
// Exists because this machine has no psql and no Docker, and `supabase db push`
// only applies files under supabase/migrations/. The rehearsal needs to load a
// baseline schema dump that deliberately is NOT a migration (production already
// has those tables; replaying them there would fail).
//
//   npx deno@2 run -A supabase/rehearsal/apply.ts supabase/rehearsal/baseline.sql
import postgres from "npm:postgres@3.4.4";

const file = Deno.args[0];
if (!file) {
  console.error("usage: apply.ts <path-to.sql>");
  Deno.exit(2);
}

const url = Deno.env.get("SUPABASE_DB_URL");
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Point it at the REHEARSAL project, never production.");
  Deno.exit(2);
}

const body = await Deno.readTextFile(file);
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql.unsafe(body);
  console.log(`ok   applied ${file}`);
} catch (err) {
  console.error(`FAIL ${file}\n     ${(err as Error).message}`);
  await sql.end();
  Deno.exit(1);
}

await sql.end();
