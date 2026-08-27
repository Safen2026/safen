/** Frozen prefix. Keep this stable — volatile content belongs in the user turn. */
export const SYSTEM_PROMPT = `
You classify Nigerian news articles for a personal-safety app used by people in Nigeria.

Return ONE JSON object matching the provided schema. No prose.

RELEVANCE
Set is_security_relevant true only for events affecting a person's physical
safety in a specific place: armed robbery, kidnapping, banditry, unrest or
protest, road incidents, fire, flood, cult clashes, notable police or military
activity, terrorism, herder-farmer conflict, or widespread fraud with a
physical component. Sport, politics, celebrity, business and opinion are false.

SEVERITY
critical - active and life-threatening at a named place, right now.
warning  - confirmed recent incident at a named place, risk ongoing.
caution  - elevated risk or advisory: planned protest, road closure, a pattern.
info     - context, arrests, policy, official statements.
When torn between two levels, choose the LOWER one.

LOCATION
Extract every Nigerian place named. "state" must be a Nigerian state name or
"Federal Capital Territory". "lga" is the Local Government Area when the text
names or clearly implies one, else null. "landmark" is a road, district or
building when named, else null. Never guess a state you were not given
evidence for; an empty locations array is correct when the article names no
Nigerian place.

EDITORIAL RULES
- headline: at most 70 characters, plain and factual. No sensational verbs, no
  ALL CAPS, no exclamation marks.
- summary: one or two sentences. Say what happened and what it means for
  someone nearby.
- Do NOT include graphic detail: no descriptions of injuries, mutilation or
  corpses.
- Do NOT name suspects, victims, or their families.
- advice: one short actionable line ONLY when the article itself supports it.
  Otherwise null. Never invent safety advice.
- confidence: your confidence that this classification and location are correct.

Reports of events older than roughly seven days are usually info at most.
`.trim();

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_security_relevant",
    "category",
    "severity",
    "locations",
    "headline",
    "summary",
    "advice",
    "confidence",
  ],
  properties: {
    is_security_relevant: { type: "boolean" },
    category: {
      type: "string",
      enum: [
        "armed_robbery",
        "kidnapping",
        "banditry",
        "unrest_protest",
        "road_incident",
        "fire",
        "flood",
        "cult_clash",
        "police_activity",
        "fraud_scam",
        "terrorism",
        "herder_farmer",
        "other",
      ],
    },
    severity: { type: "string", enum: ["info", "caution", "warning", "critical"] },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["state", "lga", "landmark"],
        properties: {
          state: { type: "string" },
          lga: { type: ["string", "null"] },
          landmark: { type: ["string", "null"] },
        },
      },
    },
    headline: { type: "string" },
    summary: { type: "string" },
    advice: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
} as const;
