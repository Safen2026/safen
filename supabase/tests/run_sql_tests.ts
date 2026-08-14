import postgres from "npm:postgres@3.4.4";

const url = Deno.env.get("SUPABASE_DB_URL");
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Point it at the REHEARSAL project, never production.");
  Deno.exit(2);
}

// max: 1 is load-bearing. `set safen.expected_fp` below is per-SESSION, so with
// a pool the setting can land on one connection while the test files run on
// another — 01_fingerprint would then read NULL and fail with a drift message
// that has nothing to do with drift.
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const proc = new Deno.Command("npx", {
  args: ["deno@2", "run", "supabase/functions/_shared/emit_fingerprint.ts",
         "security", "Man\ttook\nmy   BAG"],
  stdout: "piped",
});
const expectedFp = new TextDecoder().decode((await proc.output()).stdout).trim();
await sql.unsafe(`set safen.expected_fp = '${expectedFp}'`);

const dir = new URL("./", import.meta.url);
const files = [...Deno.readDirSync(dir)]
  .filter((f) => f.name.endsWith(".sql"))
  .map((f) => f.name)
  .sort();

let failed = 0;
for (const name of files) {
  const body = await Deno.readTextFile(new URL(name, dir));
  try {
    await sql.unsafe(body);
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}
await sql.end();
console.log(failed === 0 ? "\nAll SQL tests passed." : `\n${failed} SQL test file(s) failed.`);
Deno.exit(failed === 0 ? 0 : 1);
