import { assertEquals } from "jsr:@std/assert@1";
import { secretMatches } from "./auth.ts";

Deno.test("matching secret is accepted", async () => {
  assertEquals(await secretMatches("s3cret-value", "s3cret-value"), true);
});

Deno.test("wrong secret is rejected", async () => {
  assertEquals(await secretMatches("s3cret-valuX", "s3cret-value"), false);
});

Deno.test("prefix of the secret is rejected", async () => {
  assertEquals(await secretMatches("s3cret", "s3cret-value"), false);
});

Deno.test("missing header is rejected", async () => {
  assertEquals(await secretMatches(null, "s3cret-value"), false);
});

Deno.test("fails closed when the server secret is unset", async () => {
  assertEquals(await secretMatches("", undefined), false);
  assertEquals(await secretMatches("anything", ""), false);
});
