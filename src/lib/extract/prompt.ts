import { PRODUCT_FIELDS } from "./types";

// ═══════════════════════════════════════════════════════════════
// EXTRACTION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
//
// DESIGN DECISION: Single-turn, structured JSON extraction.
//   We don't do multi-turn because datasheets are self-contained
//   — the model sees the whole document at once. A single prompt
//   with a tight JSON schema is faster and more reliable than
//   chaining "find dimensions" → "find certifications" calls.
//
// CONFIDENCE CALIBRATION: The prompt explicitly ties confidence
//   to *observable evidence*. "If you see the exact number in a
//   spec table, that's 0.95. If you're inferring from context,
//   that's 0.5." This gives human reviewers a meaningful signal
//   rather than a vague number.
//
// SOURCE CITATION: Every field must cite the exact snippet it came
//   from. This is the trust foundation — when a human sees
//   "IP Rating: IP67" they can click and see the original table
//   cell highlighted. No blind trust.
// ═══════════════════════════════════════════════════════════════

const FIELD_LIST = PRODUCT_FIELDS.map(
  (f) => `  - "${f.key}" (${f.label})`
).join("\n");

export const EXTRACTION_SYSTEM_PROMPT = `You are an industrial product datasheet extraction agent. Your job is to read a product datasheet (PDF or image) and extract structured product attributes into JSON.

## CRITICAL RULES

1. Return ONLY valid JSON. No markdown, no explanation, no code fences.
2. Only extract fields that are PRESENT in the document. Do not invent or guess values.
3. Every field must include a confidence score and source citation.
4. Preserve units exactly as written (e.g. "250mm", "IP67", "CE, UL, RoHS").
5. If a value appears multiple times, use the most specific/authoritative occurrence.

## CONFIDENCE CALIBRATION

Use these anchors:
- 0.95–1.00: Value is explicitly stated in a specification table, data sheet cell, or labeled diagram. You can quote the exact source text.
- 0.80–0.94: Value is clearly stated in body text but not in a formal spec table, or requires minor unit conversion.
- 0.60–0.79: Value is implied or partially stated (e.g., "rated for outdoor use" → IP rating inferred but not explicit).
- 0.30–0.59: Value is guessed from context, brand knowledge, or similar products. The document does not clearly state this.
- 0.00–0.29: Highly uncertain — very little evidence in the document.

## SOURCE CITATION

- source_page: Page number where you found the value (0-based). Use 0 for single-page images.
- source_snippet: The EXACT text from the document that contains this value. Include 5-15 words of surrounding context. This is used to show the human reviewer where the value came from. If from a table, include the row.

## PRODUCT NAME

Set product_name to the most specific product name/identifier shown in the document (e.g., "SKF 6205-2RS Deep Groove Ball Bearing" not just "Ball Bearing").

## FIELDS TO EXTRACT

${FIELD_LIST}

## OUTPUT FORMAT

{
  "product_name": "<string>",
  "fields": [
    {
      "field": "<field_key>",
      "value": "<extracted_value>",
      "confidence": <0.0-1.0>,
      "source_page": <number>,
      "source_snippet": "<exact text from document>"
    }
  ]
}

## EXAMPLE

{
  "product_name": "Schneider Electric ATV320U22N4C Variable Speed Drive",
  "fields": [
    {
      "field": "manufacturer",
      "value": "Schneider Electric",
      "confidence": 0.98,
      "source_page": 0,
      "source_snippet": "Schneider Electric — ATV320 Variable Speed Drives"
    },
    {
      "field": "voltage",
      "value": "200–240V AC ±10%",
      "confidence": 0.95,
      "source_page": 1,
      "source_snippet": "Rated supply voltage: 200–240V AC ±10%, 50/60 Hz"
    },
    {
      "field": "ip_rating",
      "value": "IP20",
      "confidence": 0.92,
      "source_page": 2,
      "source_snippet": "IP rating: IP20 (with optional IP55 kit)"
    },
    {
      "field": "material",
      "value": "Aluminium housing, PC front cover",
      "confidence": 0.88,
      "source_page": 3,
      "source_snippet": "Housing: die-cast aluminium. Front cover: polycarbonate"
    }
  ]
}`;

/** User prompt wrapping the file — sent as the user message with the document */
export function buildUserPrompt(fileName: string): string {
  return `Extract all product attributes from this datasheet file "${fileName}". Return ONLY the JSON object as specified. Do not include any fields not found in the document.`;
}

/**
 * Post-processing: validate and clamp the LLM response.
 *
 * TRADEOFF: We try to fix common LLM mistakes (wrapping in markdown
 * code fences, extra text) rather than failing hard. For a hackathon
 * this pragmatism beats a strict parse-or-die approach.
 */
export function parseExtractionResponse(raw: string): {
  product_name: string;
  fields: {
    field: string;
    value: string;
    confidence: number;
    source_page: number;
    source_snippet: string;
  }[];
} {
  // Strip markdown code fences if the model added them
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Find the JSON object — handle cases where model adds text before/after
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(cleaned);

  // Validate minimum shape
  if (!parsed.product_name || typeof parsed.product_name !== "string") {
    throw new Error("Missing or invalid product_name in extraction response");
  }
  if (!Array.isArray(parsed.fields)) {
    throw new Error("Missing or invalid fields array in extraction response");
  }

  // Clamp confidence to [0, 1] and validate each field
  const validKeys = new Set(PRODUCT_FIELDS.map((f) => f.key));
  const fields = parsed.fields
    .filter((f: Record<string, unknown>) => {
      if (!f.field || typeof f.field !== "string") return false;
      if (!f.value || typeof f.value !== "string") return false;
      return true;
    })
    .map((f: Record<string, unknown>) => ({
      field: f.field as string,
      value: (f.value as string).trim(),
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
      source_page: Math.max(0, Number(f.source_page) || 0),
      source_snippet: String(f.source_snippet || ""),
    }));

  return {
    product_name: parsed.product_name.trim(),
    fields,
  };
}
