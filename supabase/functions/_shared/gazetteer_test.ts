import { assertEquals } from "jsr:@std/assert@1";
import { type GazetteerTables, normalisePlace, resolveLocations } from "./gazetteer.ts";

const tables: GazetteerTables = {
  states: [
    { code: "LA", name: "Lagos" },
    { code: "KN", name: "Kano" },
    { code: "KD", name: "Kaduna" },
    { code: "FC", name: "Federal Capital Territory" },
  ],
  lgas: [
    { code: "LA-ikeja", state_code: "LA", name: "Ikeja" },
    { code: "LA-eti-osa", state_code: "LA", name: "Eti-Osa" },
    { code: "KN-fagge", state_code: "KN", name: "Fagge" },
    { code: "KD-zaria", state_code: "KD", name: "Zaria" },
    { code: "FC-abuja", state_code: "FC", name: "Abuja" },
  ],
  aliases: [
    { alias_norm: "allen avenue", state_code: "LA", lga_code: "LA-ikeja" },
    { alias_norm: "wuse ii", state_code: "FC", lga_code: "FC-abuja" },
    { alias_norm: "sabon gari", state_code: "KN", lga_code: "KN-fagge" },
    { alias_norm: "sabon gari", state_code: "KD", lga_code: "KD-zaria" },
  ],
};

Deno.test("normalises case, whitespace and punctuation", () => {
  assertEquals(normalisePlace("  Allen   Avenue,  "), "allen avenue");
  assertEquals(normalisePlace("Eti-Osa"), "eti-osa");
});

Deno.test("resolves an exact state and LGA", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: "Ikeja", landmark: null }], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("resolves state-only when the LGA is absent", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: null, landmark: null }], tables),
    [{ state_code: "LA", lga_code: null }],
  );
});

Deno.test("a landmark alias supplies the LGA", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: null, landmark: "Allen Avenue" }], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("state context disambiguates Sabon Gari", () => {
  assertEquals(
    resolveLocations([{ state: "Kano", lga: null, landmark: "Sabon Gari" }], tables),
    [{ state_code: "KN", lga_code: "KN-fagge" }],
  );
  assertEquals(
    resolveLocations([{ state: "Kaduna", lga: null, landmark: "Sabon Gari" }], tables),
    [{ state_code: "KD", lga_code: "KD-zaria" }],
  );
});

Deno.test("Abuja maps to the FCT", () => {
  assertEquals(
    resolveLocations([{ state: "Abuja", lga: null, landmark: "Wuse II" }], tables),
    [{ state_code: "FC", lga_code: "FC-abuja" }],
  );
});

Deno.test("an unknown state resolves to nothing — never a guess", () => {
  assertEquals(
    resolveLocations([{ state: "Atlantis", lga: "Nowhere", landmark: null }], tables),
    [],
  );
});

Deno.test("an unknown LGA still yields the state", () => {
  assertEquals(
    resolveLocations([{ state: "Lagos", lga: "Nowhere", landmark: null }], tables),
    [{ state_code: "LA", lga_code: null }],
  );
});

Deno.test("duplicate resolutions are collapsed", () => {
  assertEquals(
    resolveLocations([
      { state: "Lagos", lga: "Ikeja", landmark: null },
      { state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" },
    ], tables),
    [{ state_code: "LA", lga_code: "LA-ikeja" }],
  );
});

Deno.test("an empty locations array resolves to empty", () => {
  assertEquals(resolveLocations([], tables), []);
});
