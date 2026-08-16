import { fingerprint } from "./fingerprint.ts";
const [category, description] = Deno.args;
console.log(await fingerprint(category ?? "", description ?? ""));
