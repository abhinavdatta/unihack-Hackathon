// ═══════════════════════════════════════════════════════════════
// EXTRACTION SCHEMA — the canonical field definitions for an
// industrial product datasheet. These are the fields the LLM is
// asked to extract. Add new fields here and they'll automatically
// appear in the prompt and UI.
// ═══════════════════════════════════════════════════════════════

/** Canonical fields the extraction agent targets */
export const PRODUCT_FIELDS = [
  { key: "product_name", label: "Product Name", group: "identity" },
  { key: "manufacturer", label: "Manufacturer", group: "identity" },
  { key: "model_number", label: "Model / Part Number", group: "identity" },
  { key: "category", label: "Product Category", group: "identity" },
  { key: "description", label: "Description", group: "identity" },
  { key: "material", label: "Material", group: "physical" },
  { key: "dimensions", label: "Dimensions (L × W × H)", group: "physical" },
  { key: "weight", label: "Weight", group: "physical" },
  { key: "color_finish", label: "Color / Finish", group: "physical" },
  { key: "operating_temp", label: "Operating Temperature", group: "performance" },
  { key: "voltage", label: "Voltage Rating", group: "performance" },
  { key: "current_rating", label: "Current Rating", group: "performance" },
  { key: "power_rating", label: "Power Rating", group: "performance" },
  { key: "frequency", label: "Frequency", group: "performance" },
  { key: "ip_rating", label: "IP Rating", group: "performance" },
  { key: "flow_rate", label: "Flow Rate", group: "performance" },
  { key: "pressure_rating", label: "Pressure Rating", group: "performance" },
  { key: "certifications", label: "Certifications", group: "compliance" },
  { key: "standards", label: "Standards Compliance", group: "compliance" },
  { key: "warranty", label: "Warranty", group: "compliance" },
] as const;

export type ProductFieldKey = (typeof PRODUCT_FIELDS)[number]["key"];

export const FIELD_GROUPS = [
  { key: "identity", label: "Identity" },
  { key: "physical", label: "Physical Properties" },
  { key: "performance", label: "Performance Specs" },
  { key: "compliance", label: "Compliance & Warranty" },
] as const;

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE LEVELS — the UI/UX colour system
// ═══════════════════════════════════════════════════════════════
//
// DESIGN DECISION: Three-tier badge system.
//   ≥ 0.85  → HIGH   (green)   auto-approved, no review needed
//   0.60–0.84 → MEDIUM (amber)  routed to review queue
//   < 0.60  → LOW    (red)    routed to review queue, flagged urgent
//
// Why not a continuous gradient? Because a badge system is instantly
// legible at a glance across a grid of 20+ fields. Industrial
// users need to triage fast — a colour + label beats a number.
// ═══════════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "medium" | "low";

export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  low: 0.6,
} as const;

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.low) return "medium";
  return "low";
}

/** Needs human review if confidence < 0.85 */
export function needsReview(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.high;
}

/** UI tokens for each confidence level */
export const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  high: {
    label: "High",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  medium: {
    label: "Medium",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  low: {
    label: "Low",
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  },
};

// ═══════════════════════════════════════════════════════════════
// FIELD STATUS — the review lifecycle
// ═══════════════════════════════════════════════════════════════

export type FieldStatus =
  | "extracted"     // fresh from LLM, not yet reviewed
  | "needs_review"  // below confidence threshold, queued for review
  | "approved"      // human confirmed the value
  | "edited"        // human changed the value
  | "rejected";     // human discarded the value

export type ProductStatus =
  | "extracted"     // all fields extracted, review not started
  | "needs_review"  // at least one field needs review
  | "approved"      // all fields approved/edited
  | "completed";    // exported

// ═══════════════════════════════════════════════════════════════
// LLM EXTRACTION TYPES — what the VLM returns
// ═══════════════════════════════════════════════════════════════

export interface ExtractedField {
  /** Canonical field key (must match PRODUCT_FIELDS[].key) */
  field: string;
  /** Extracted value — keep as string, preserve units */
  value: string;
  /** 0.0 – 1.0, how confident the model is */
  confidence: number;
  /** Page number in the source document (0 if image / single page) */
  source_page: number;
  /** The exact text snippet this value was pulled from */
  source_snippet: string;
}

export interface ExtractionResponse {
  /** Product name as identified by the model */
  product_name: string;
  /** Extracted fields — only include fields found in the document */
  fields: ExtractedField[];
}

/** Multi-product extraction — a single document may contain multiple products */
export interface MultiExtractionResponse {
  products: ExtractionResponse[];
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA.ORG EXPORT TYPE — what the user downloads
// ═══════════════════════════════════════════════════════════════

export interface SchemaOrgProduct {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  manufacturer?: string;
  model?: string;
  description?: string;
  category?: string;
  material?: string;
  additionalProperty: {
    "@type": "PropertyValue";
    name: string;
    value: string;
  }[];
}
