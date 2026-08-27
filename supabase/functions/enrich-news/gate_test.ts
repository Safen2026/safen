import { assertEquals } from "jsr:@std/assert@1";
import { evaluateGate, type ResolvedLocation, type Verdict } from "./gate.ts";

const ok: Verdict = {
  is_security_relevant: true,
  category: "armed_robbery",
  severity: "warning",
  locations: [{ state: "Lagos", lga: "Ikeja", landmark: "Allen Avenue" }],
  headline: "Robbery repelled on Allen Avenue",
  summary: "Police repelled an attempted robbery in Ikeja overnight.",
  advice: "Avoid the area until traffic clears.",
  confidence: 0.9,
};
const resolved: ResolvedLocation[] = [{ state_code: "LA", lga_code: "LA-ikeja" }];

Deno.test("publishes a confident, relevant, located item", () => {
  assertEquals(evaluateGate(ok, resolved), { publish: true, reason: null });
});

Deno.test("rejects an irrelevant item", () => {
  assertEquals(
    evaluateGate({ ...ok, is_security_relevant: false }, resolved).reason,
    "not_relevant",
  );
});

Deno.test("rejects below the confidence floor", () => {
  assertEquals(evaluateGate({ ...ok, confidence: 0.69 }, resolved).reason, "low_confidence");
});

Deno.test("accepts exactly at the confidence floor", () => {
  assertEquals(evaluateGate({ ...ok, confidence: 0.7 }, resolved).publish, true);
});

Deno.test("rejects when nothing resolved — fail closed", () => {
  assertEquals(evaluateGate(ok, []).reason, "no_location");
});

Deno.test("a state-only resolution is enough", () => {
  assertEquals(
    evaluateGate(ok, [{ state_code: "LA", lga_code: null }]).publish,
    true,
  );
});

Deno.test("rejects blank copy so an empty card never reaches the feed", () => {
  assertEquals(evaluateGate({ ...ok, headline: "   " }, resolved).reason, "empty_copy");
  assertEquals(evaluateGate({ ...ok, summary: "" }, resolved).reason, "empty_copy");
});

Deno.test("relevance is checked before confidence", () => {
  assertEquals(
    evaluateGate({ ...ok, is_security_relevant: false, confidence: 0.1 }, []).reason,
    "not_relevant",
  );
});
