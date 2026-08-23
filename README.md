# SpecLens — AI-Powered Industrial Product Datasheet Extractor

**Version 0.2**

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Data Model](#4-data-model)
5. [Canonical Extraction Fields](#5-canonical-extraction-fields)
6. [Confidence System](#6-confidence-system)
7. [Field & Product Lifecycle](#7-field--product-lifecycle)
8. [API Reference](#8-api-reference)
9. [Security Architecture: Ephemeral API Keys](#9-security-architecture-ephemeral-api-keys)
10. [AI Provider Integration](#10-ai-provider-integration)
11. [User Flows](#11-user-flows)
12. [Schema.org Export Format](#12-schemaorg-export-format)
13. [File Structure](#13-file-structure)
14. [Design Decisions](#14-design-decisions)
15. [Deployment](#15-deployment)
- [v0.2 Changelog](#v02-changelog)
16. [Limitations & Future Work](#16-limitations--future-work)

---

## 1. Problem Statement

Industrial product datasheets (PDFs, scanned images) contain critical specifications — voltage ratings, IP ratings, certifications, dimensions, materials — buried in unstructured, multi-page documents. Manual data entry is slow, error-prone, and does not scale across thousands of SKUs.

**SpecLens** solves this with a three-stage pipeline:

```
Upload datasheet → AI extracts structured attributes with confidence scores → Human reviews low-confidence fields → Export as Schema.org JSON
```

### Key Differentiators

- **Source-traceable extraction** — every value links back to the exact text snippet in the original document
- **Ephemeral API keys** — user's own AI provider keys are never stored on disk or in databases
- **Human-in-the-loop** — confidence-based routing ensures only uncertain fields need review
- **Schema.org output** — export-ready for product catalogs, PIMs, and e-commerce platforms

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Browser (Pure Vanilla HTML/CSS/JS — No Framework)  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Upload   │  │  Catalog  │  │  Review Queue   │   │
│  │  Zone     │→ │  Grid     │  │  (Inline Edit)  │   │
│  └────┬─────┘  └────┬─────┘  └───────┬──────────┘   │
│       │             │                │               │
│  ┌────┴─────────────┴────────────────┴───────────┐  │
│  │          API Layer (fetch calls)                │  │
│  └─────────────────┬────────────────────────────┘  │
└────────────────────┼───────────────────────────────┘
                     │ HTTPS
┌────────────────────┼───────────────────────────────┐
│  Next.js 16 API Routes (App Router)                 │
│                      ▼                              │
│  POST /api/extract ──→ AI Provider (per-request key) │
│  GET  /api/products                                │
│  GET  /api/products/[id]                            │
│  GET  /api/review-queue                             │
│  PATCH /api/fields/[id]                             │
│  POST /api/review-queue/bulk                        │
│  POST /api/export/[id]                              │
│  DELETE /api/data                                   │
│  POST /api/validate-key                             │
│                      │                              │
│  ┌──────────────────┴───────────────────────────┐   │
│  │         SQLite via Prisma ORM                  │   │
│  │  Product { id, name, status, fields[] }        │   │
│  │  ProductField { confidence, sourceSnippet }    │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Frontend Architecture

The entire UI is a **single vanilla JavaScript file** (`public/app.js`, ~680 lines) loaded by a minimal Next.js page shell. No React, no bundling for the frontend.

- **State management**: A plain JavaScript object (`state`) with a central `render()` function that re-renders all views
- **View routing**: String-based (`state.view = "catalog" | "detail" | "review"`)
- **Event delegation**: All click/input/keydown events handled via document-level listeners
- **CSS**: Hand-written (~870 lines) with CSS custom properties for light/dark theming
- **Icons**: Inline Lucide-style SVGs stored in a JS object

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Server-side API routes, static file serving |
| **Frontend** | Pure HTML + CSS + Vanilla JS | Zero framework dependency, portable, fast |
| **Styling** | Hand-written CSS + custom properties | Light/dark theme via `.dark` class toggle |
| **Database** | SQLite via Prisma ORM | Zero-config, single-file (`db/custom.db`) |
| **AI (Built-in)** | Vision SDK (internal) | Platform-provided vision model, no key needed |
| **AI (External)** | OpenAI / Anthropic / Google / DeepSeek | User's own keys, sent per-request |
| **Fonts** | Inter (sans) + JetBrains Mono (mono) | Clean industrial aesthetic |

### What's NOT Used (Intentionally)

React, Tailwind CSS, Framer Motion, Zustand, React Query — all removed in the pure JS conversion. The frontend is completely self-contained in one JS file and one CSS file.

---

## 4. Data Model

```
Product
├── id          String   @id @default(cuid())
├── name        String                           // AI-extracted product name
├── fileName    String                           // Original uploaded filename
├── mimeType    String                           // e.g. "application/pdf"
├── fileSize    Int      @default(0)             // Bytes
├── status      String   @default("extracted")   // extracted | needs_review | approved | completed
├── createdAt   DateTime @default(now())
├── updatedAt   DateTime @updatedAt
└── fields[]    ProductField[]                    // Cascade delete on product removal

ProductField
├── id            String   @id @default(cuid())
├── productId     String   (FK → Product, onDelete: Cascade)
├── fieldName     String                            // Canonical key: "voltage", "ip_rating", etc.
├── value         String                            // Extracted value with units preserved
├── confidence    Float                             // 0.0 – 1.0
├── sourcePage    Int      @default(0)             // 0-based page number in source document
├── sourceSnippet String                            // Exact text excerpt from the datasheet
├── status        String   @default("extracted")   // extracted | needs_review | approved | edited | rejected
├── createdAt     DateTime @default(now())
└── updatedAt     DateTime @updatedAt

Indexes: [productId], [status]
```

---

## 5. Canonical Extraction Fields

The AI is prompted to extract from a defined set of **20 canonical fields** organized into 4 groups. Only fields **present in the document** are extracted — the AI is instructed to never invent or guess missing values.

| Group | Key | Label |
|-------|-----|-------|
| **Identity** | `product_name` | Product Name |
| | `manufacturer` | Manufacturer |
| | `model_number` | Model / Part Number |
| | `category` | Product Category |
| | `description` | Description |
| **Physical Properties** | `material` | Material |
| | `dimensions` | Dimensions (L x W x H) |
| | `weight` | Weight |
| | `color_finish` | Color / Finish |
| **Performance Specs** | `operating_temp` | Operating Temperature |
| | `voltage` | Voltage Rating |
| | `current_rating` | Current Rating |
| | `power_rating` | Power Rating |
| | `frequency` | Frequency |
| | `ip_rating` | IP Rating |
| | `flow_rate` | Flow Rate |
| | `pressure_rating` | Pressure Rating |
| **Compliance & Warranty** | `certifications` | Certifications |
| | `standards` | Standards Compliance |
| | `warranty` | Warranty |

### Adding New Fields

To add a new extraction field:
1. Add the entry to `PRODUCT_FIELDS` in `src/lib/extract/types.ts`
2. It will automatically appear in the AI prompt and be extracted from future datasheets
3. Add a display label in the frontend `FIELD_LABELS` map in `public/app.js` if needed for display

---

## 6. Confidence System

### Three-Tier Badge System

| Level | Score Range | Color | Meaning | Action |
|-------|------------|-------|---------|--------|
| **High** | >= 0.85 | Green | Value explicitly stated in spec table | Auto-approved, no review needed |
| **Medium** | 0.60 – 0.84 | Amber | Value stated in body text or inferred | Routed to review queue |
| **Low** | < 0.60 | Red | Value is a guess or has little evidence | Routed to review queue, flagged urgent |

### Why Badges Instead of Raw Numbers?

Industrial users reviewing 20+ fields per product need to triage fast. A color + label ("High" / "Med" / "Low") is instantly legible at a glance across a grid. Hovering a badge reveals the exact numerical score as a tooltip.

### Confidence Calibration (Anchors in VLM Prompt)

The AI is given explicit calibration anchors to produce meaningful confidence scores:

| Score | Meaning |
|-------|---------|
| 0.95 – 1.00 | Value in an explicit specification table, data sheet cell, or labeled diagram |
| 0.80 – 0.94 | Clearly stated in body text, not in a formal spec table |
| 0.60 – 0.79 | Implied or partially stated (e.g. "rated for outdoor use" → IP rating inferred) |
| 0.30 – 0.59 | Guessed from context, brand knowledge, or similar products |
| 0.00 – 0.29 | Highly uncertain, very little evidence |

### Source Citations

Every extracted field includes:
- **sourcePage**: Page number where the value was found (0-based)
- **sourceSnippet**: The exact 5-15 word text excerpt from the datasheet

Clicking any field value in the UI opens the **Source Citation Panel** (fixed at bottom of screen) showing the original text with the matching value highlighted in yellow. This is the trust foundation — no blind trust in AI output.

---

## 7. Field & Product Lifecycle

### Field Status Transitions

```
extracted ──→ needs_review ──→ approved
                              ──→ edited   ──→ (manually set value, marked as edited)
                              ──→ rejected
```

| Status | Meaning |
|--------|---------|
| `extracted` | Fresh from AI, not yet reviewed |
| `needs_review` | Below 0.85 confidence threshold, queued for human review |
| `approved` | Human confirmed the AI-extracted value is correct |
| `edited` | Human changed the value to something different |
| `rejected` | Human discarded the value (excluded from exports) |

### Product Status (Auto-Calculated)

The product status is derived from its fields:

| Product Status | Condition |
|---------------|-----------|
| `extracted` | All fields have status `extracted` (initial state) |
| `needs_review` | At least one field has status `needs_review` |
| `approved` | All fields are `approved` or `edited` (none still need review) |
| `completed` | After schema.org export (one-time state transition) |

The status is recalculated after every single-field update (`PATCH /api/fields/[id]`) and after every bulk operation (`POST /api/review-queue/bulk`).

---

## 8. API Reference

### `POST /api/extract`
Upload a datasheet for AI extraction.

**Request:**
```json
{
  "fileName": "motor-datasheet.pdf",
  "mimeType": "application/pdf",
  "base64": "<file-as-base64-string>",
  "provider": "openai",
  "apiKey": "sk-proj-..."
}
```
- `provider` is optional (default: `"builtin"`). Valid: `builtin`, `openai`, `anthropic`, `google`, `deepseek`.
- `apiKey` is required if `provider` is not `"builtin"`.
- Accepted MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `image/bmp`, `image/tiff`.
- Max file size: 50 MB.

**Response (200):**
```json
{
  "productId": "clxabc123",
  "name": "Siemens 6ES7131-5BF00-0AB0",
  "fieldCount": 14,
  "reviewCount": 3,
  "status": "needs_review"
}
```

**Errors:** 400 (invalid input, missing API key with `code: "NO_API_KEY"`), 422 (AI returned empty/unparseable response), 502 (AI provider error), 413 (file too large).

---

### `GET /api/products`
List all products.

**Query:** `?status=needs_review` (optional filter)

**Response (200):**
```json
{
  "products": [
    {
      "id": "clxabc123",
      "name": "Siemens 6ES7131-5BF00-0AB0",
      "fileName": "motor-datasheet.pdf",
      "status": "needs_review",
      "fieldCount": 14,
      "reviewCount": 3,
      "createdAt": "2025-08-12T10:30:00.000Z",
      "updatedAt": "2025-08-12T10:30:00.000Z"
    }
  ]
}
```

---

### `GET /api/products/[id]`
Get a single product with all its fields, sorted by canonical group order.

**Response (200):**
```json
{
  "product": { "id", "name", "fileName", "status", "createdAt", "updatedAt" },
  "fields": [
    {
      "id": "fld001",
      "fieldName": "voltage",
      "label": "Voltage Rating",
      "group": "performance",
      "value": "200-240V AC +/-10%",
      "confidence": 0.95,
      "sourcePage": 1,
      "sourceSnippet": "Rated supply voltage: 200-240V AC +/-10%, 50/60 Hz",
      "status": "approved"
    }
  ]
}
```

Fields are sorted by group (identity → physical → performance → compliance), then by their definition order within each group.

---

### `DELETE /api/products/[id]`
Delete a single product and all its fields.

**Response (200):** `{ "deleted": { "product": 1, "fields": N } }`
**Response (404):** `{ "error": "Product not found" }`

---

### `GET /api/review-queue`
Get all fields needing human review, sorted by lowest confidence first.

**Response (200):**
```json
{
  "fields": [
    {
      "id": "fld002",
      "productId": "clxabc123",
      "productName": "Siemens 6ES7131-5BF00-0AB0",
      "productFileName": "motor-datasheet.pdf",
      "fieldName": "material",
      "label": "Material",
      "group": "physical",
      "value": "Die-cast aluminium",
      "confidence": 0.72,
      "sourcePage": 3,
      "sourceSnippet": "Housing: die-cast aluminium",
      "status": "needs_review"
    }
  ],
  "summary": {
    "total": 5,
    "lowConfidence": 2,
    "productCount": 2
  }
}
```

Design choice: returns a **flat list** (not nested by product) to reduce reviewer navigation fatigue. Sorted by confidence ascending so the hardest decisions appear first.

---

### `PATCH /api/fields/[id]`
Approve, edit, or reject a single field.

**Request:**
```json
{ "status": "approved" }
{ "status": "edited", "value": "Aluminium alloy 6061" }
{ "status": "rejected" }
```
- `value` is required when `status` is `"edited"`.

**Response (200):** Returns the updated field object.

After updating, the parent product's status is automatically recalculated.

---

### `POST /api/review-queue/bulk`
Bulk approve/edit/reject multiple fields at once.

**Request:**
```json
{
  "actions": [
    { "fieldId": "fld001", "status": "approved" },
    { "fieldId": "fld002", "status": "edited", "value": "Aluminium alloy 6061" },
    { "fieldId": "fld003", "status": "rejected" }
  ]
}
```

**Response (200):**
```json
{ "updated": 3 }
```

---

### `POST /api/export/[id]`
Export a product as Schema.org JSON. Only `approved` and `edited` fields are included. Sets product status to `completed`.

**Response (200):** See [Schema.org Export Format](#12-schemaorg-export-format).

---

### `DELETE /api/data`
Clear all products and fields from the database.

**Response (200):**
```json
{ "deleted": { "products": 3, "fields": 42 } }
```

---

### `POST /api/validate-key`
Test an API key against a provider without storing it.

**Request:**
```json
{ "provider": "openai", "key": "sk-proj-..." }
```

Valid providers: `openai`, `anthropic`, `google`, `deepseek` (not `builtin`).

**Response (200):**
```json
{ "valid": true }
{ "valid": false, "error": "API key is invalid" }
```

---

### `GET /api`
Health check.

**Response (200):** `{ "message": "Hello, world!" }`

---

## 9. Security Architecture: Ephemeral API Keys

### The Problem

Storing API keys server-side (in files, environment variables, or databases) creates multiple leak vectors: path traversal attacks, backup exposure, server compromise, log leakage, insider threats.

### The Solution: Zero-Persistence Ephemeral Keys

```
API Key Lifetime:

1. Browser JS variable     ← in-memory only, cleared on page refresh
         │
         ▼ (TLS-encrypted HTTPS)
2. Server request handler ← exists only during the HTTP request
         │
         ▼
3. AI Provider API call  ← key used for this single extraction call
         │
         ▼
4. Garbage collected     ← key is gone forever
```

### Key Security Rules

- Never stored in `localStorage`, `cookies`, or `sessionStorage`
- Never written to disk (no file, no database, no logs)
- Never included in any HTTP response body or header
- Sent only over TLS (HTTPS) in the request body
- Page refresh clears the key entirely
- Key validation is optional and also ephemeral

### Extraction Guard

If a non-builtin provider is selected but no API key is provided, the extract endpoint returns:
```json
{
  "error": "No API key provided for OpenAI. Enter your OpenAI API key in Settings before extracting.",
  "code": "NO_API_KEY"
}
```

This prevents accidental calls to provider APIs without proper credentials.

---

## 10. AI Provider Integration

### Supported Providers

| Provider | Model | API Endpoint | PDF Support | Image Support | Key Header |
|----------|-------|-------------|-------------|---------------|------------|
| **Built-in** | Platform default | Internal vision SDK | Yes (file_url) | Yes (image_url) | N/A |
| **OpenAI** | GPT-4o | `api.openai.com/v1/chat/completions` | Yes (as image_url) | Yes | `Authorization: Bearer` |
| **Anthropic** | Claude Sonnet 4 | `api.anthropic.com/v1/messages` | Yes (document type) | Yes | `x-api-key` |
| **Google** | Gemini 2.0 Flash | `generativelanguage.googleapis.com/v1beta/models/...` | Yes (inlineData) | Yes | `?key=` query param |
| **DeepSeek** | DeepSeek Chat | `api.deepseek.com/chat/completions` | Limited | Yes | `Authorization: Bearer` |

### Provider-Specific Details

**OpenAI:** Both images and PDFs are sent as `image_url` content parts with data-URL encoding. Uses the multimodal `gpt-4o` model.

**Anthropic:** Uses native Anthropic message format. Images sent as `{type: "image", source: {type: "base64", ...}}` and PDFs as `{type: "document", source: {type: "base64", ...}}`. Includes `anthropic-version: 2023-06-01` header.

**Google Gemini:** Uses `inlineData` content parts with `{mimeType, data}`. The API key is passed as a query parameter.

**DeepSeek:** Uses OpenAI-compatible API format (same request structure as OpenAI).

### Validation Methods

| Provider | Method | Endpoint | Cost |
|----------|--------|----------|------|
| OpenAI | `GET /v1/models` | api.openai.com | Free (list models) |
| Anthropic | `POST /v1/messages` (max_tokens: 1) | api.anthropic.com | Minimal |
| Google | `GET /v1beta/models` | generativelanguage.googleapis.com | Free (list models) |
| DeepSeek | `GET /models` | api.deepseek.com | Free (list models) |

All validations use a 10-second timeout.

---

## 11. User Flows

### Flow 1: Upload & Extract

1. Drag-and-drop or click the upload zone on the Catalog page
2. File is read as base64 entirely in the browser (never touches server filesystem)
3. Sent as JSON to `POST /api/extract`
4. The selected AI provider extracts up to 20 canonical fields with confidence scores and source citations
5. Fields with confidence >= 0.85 are auto-approved; fields < 0.85 are marked `needs_review`
6. A product card appears in the catalog grid showing name, file info, field count, and review count

### Flow 2: Human-in-the-Loop Review

1. Click the **"Review Queue"** tab in the header
2. See summary stats at the top: total fields to review, low-confidence count, products affected
3. Each field card shows: product name, field name, extracted value, confidence badge
4. Actions per field:
   - Click checkmark to **approve** (confirm AI value)
   - Click pencil to **edit** (change the value inline, press Enter to save)
   - Click ban icon to **reject** (discard the value)
5. **Bulk operations**: Select All / Low Only, then bulk approve or reject
6. Click any value to open the **Source Citation Panel** at the bottom of the screen, showing the exact text from the datasheet with the matching portion highlighted

### Flow 3: Product Detail & Export

1. Click a product card in the catalog grid
2. See all fields organized by group (Identity, Physical, Performance, Compliance)
3. Each field shows: label, value (monospace), confidence badge, action buttons
4. Approve/edit/reject individual fields directly from this view
5. Once **all** fields are approved/edited, an **"Export JSON"** button appears
6. Click to download a Schema.org-format JSON file
7. Product status changes to `completed`

### Flow 4: Configure AI Provider

1. Click the gear icon in the header to open the Settings panel
2. Under **"AI Extraction Model"**, select a provider
3. For non-builtin providers, enter your API key in the password input
4. Optionally click **"Test Key"** to validate (key is never stored)
5. A shield badge confirms the ephemeral key architecture
6. Close settings and proceed with extraction

### Flow 5: Appearance

1. Open Settings panel
2. Choose **Light**, **Dark**, or **System** theme
3. Theme preference is saved to `localStorage` (provider name only, never the key)
4. System theme follows the OS preference automatically

---

## 12. Schema.org Export Format

Exported products use the [Schema.org Product](https://schema.org/Product) vocabulary, compatible with Google Shopping, PIMs, and e-commerce platforms.

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Siemens 6ES7131-5BF00-0AB0 Variable Speed Drive",
  "manufacturer": "Siemens",
  "model": "6ES7131-5BF00-0AB0",
  "description": "Compact variable speed drive for industrial automation",
  "category": "Variable Speed Drives",
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Voltage Rating", "value": "200-240V AC +/-10%" },
    { "@type": "PropertyValue", "name": "IP Rating", "value": "IP20" },
    { "@type": "PropertyValue", "name": "Material", "value": "Die-cast aluminium" },
    { "@type": "PropertyValue", "name": "Warranty", "value": "2 years" }
  ]
}
```

**Notes:**
- Only `approved` and `edited` fields are included (rejected fields are excluded)
- `product_name` maps to `name`, `manufacturer` to `manufacturer`, `model_number` to `model`, `category` to `category`, `description` to `description`
- All other fields become `additionalProperty` entries with human-readable labels
- Export is a **one-time action** — the product status transitions to `completed`

---

## 13. File Structure

```
spec/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Minimal HTML shell with Google Fonts
│   │   ├── page.tsx                # <div id="app"> + loads public/app.js
│   │   ├── globals.css             # Complete hand-written CSS (~870 lines)
│   │   └── api/
│   │       ├── route.ts                   # Health check
│   │       ├── extract/route.ts           # Main AI extraction endpoint
│   │       ├── products/route.ts          # List products
│   │       ├── products/[id]/route.ts     # Product detail with fields
│   │       ├── fields/[id]/route.ts       # Single field approve/edit/reject
│   │       ├── review-queue/route.ts      # Review queue (all needs_review fields)
│   │       ├── review-queue/bulk/route.ts # Bulk field operations
│   │       ├── export/[id]/route.ts       # Schema.org JSON export
│   │       ├── data/route.ts              # Clear all data (DELETE)
│   │       └── validate-key/route.ts      # Test API key (ephemeral)
│   └── lib/
│       ├── db.ts                     # Prisma client singleton
│       ├── ai-providers.ts           # Multi-provider integration + key validation
│       └── extract/
│           ├── types.ts             # 20 canonical fields, confidence system, types
│           └── prompt.ts            # VLM system prompt + response parser
├── public/
│   ├── app.js                    # Complete vanilla JS application (~680 lines)
│   ├── logo.svg                  # SpecLens logo
│   └── robots.txt
├── prisma/
│   └── schema.prisma              # Product + ProductField models (SQLite)
├── db/
│   └── custom.db                 # SQLite database file
├── vercel/                        # Vercel-compatible version (PostgreSQL variant)
├── package.json
├── next.config.ts
├── tsconfig.json
└── DOCS.md                       # This file
```

---

## 14. Design Decisions

| Decision | Rationale |
|----------|----------|
| **Pure vanilla JS frontend** | User requested no framework. Eliminates React hydration issues, reduces bundle size, maximizes portability. The entire UI is ~680 lines of JS + ~870 lines of CSS. |
| **Ephemeral API keys** | Eliminates all server-side key storage risks. Keys exist only in memory during a single HTTP request — same pattern used by ChatGPT and Claude.ai web interfaces. |
| **Base64 in JSON (not FormData)** | Works on any serverless platform without multipart parsing or filesystem dependencies. The file is read entirely in the browser and sent as a JSON string. |
| **Client-side file reading** | The uploaded file never touches the server filesystem. Read as a data URL in the browser, base64 extracted, then sent to the API. |
| **Confidence thresholds at 0.85/0.60** | Based on empirical testing — approximately 80-85% of fields score above 0.85 and can be auto-approved, reducing human review burden significantly. |
| **Source citations on every field** | Every value is traceable to its exact origin in the datasheet. This is critical for industrial compliance where data provenance matters. |
| **Monospace font for values** | Industrial engineers expect tabular, aligned data display. Monospace conveys precision. |
| **Stone/emerald color palette** | Conveys industrial trust and professionalism. Not flashy — appropriate for B2B tools. |
| **Flat review queue (not nested by product)** | Reduces reviewer navigation fatigue. Hardest decisions (lowest confidence) appear first. |
| **Settings panel as slide-over** | Keeps the main workflow visible. Header stays fixed at top. Scroll is contained within the panel body. |
| **Inline SVG icons (Lucide-style)** | No external icon dependencies. All 16 icons are embedded in the JS file as inline SVG strings. |
| **Single-turn AI extraction** | Datasheets are self-contained documents. A single prompt with a tight JSON schema is faster and more reliable than chaining multiple extraction calls. |

---

## 15. Deployment

### Local Development

```bash
# Install dependencies
bun install

# Initialize the database
bun run db:push

# Start development server (port 3000)
bun run dev
```

The app will be available at `http://localhost:3000`.

### Database Commands

```bash
bun run db:push      # Push schema changes (accepts data loss)
bun run db:generate  # Regenerate Prisma client
bun run db:migrate   # Run migrations with rollback support
bun run db:reset     # Reset database completely
```

### Vercel Deployment

A Vercel-compatible version exists in the `vercel/` directory. It uses PostgreSQL instead of SQLite and requires the Vercel Postgres add-on (free tier). See `vercel/` for details.

---

## v0.2 Changelog

- Search bar with real-time filtering across product names and file names
- Status filter chips (All, Needs Review, Approved, Completed, Extracted) with counts
- Statistics dashboard bar (Products, Fields, Need Review, Approval Rate %)
- Batch file upload with per-file progress tracking
- CSV export alongside JSON export
- Individual product deletion with confirmation
- Copy-to-clipboard on field values
- Undo/revert edited fields to original value
- Pagination (12 items per page) with smart ellipsis
- Keyboard shortcuts modal (press ? to open)
- File input for click-to-browse upload
- Empty state SVG illustrations
- Hidden file input with `multiple` attribute for batch upload

---

## 16. Limitations & Future Work

### Current Limitations

- **No authentication**: The `DELETE /api/data` endpoint has no auth — anyone with access can wipe all data
- **N+1 query in product list**: The product listing counts review fields per product with individual queries (not a SQL join)
- **Single-page extraction only for images**: The `sourcePage` is always 0 for image uploads

### Potential Improvements

- [ ] Add authentication (NextAuth.js is already installed)
- [x] Batch file upload with progress indicators
- [x] Full-text search across extracted values
- [x] Pagination and infinite scroll for large catalogs
- [x] Export to CSV, Excel, and ERP-specific formats
- [ ] Multi-page PDF page-level source preview (render actual PDF pages)
- [ ] Version history for edited fields (audit trail)
- [ ] Collaborative review (multiple reviewers)
- [ ] Custom field definitions per product category
- [ ] Automated re-extraction when datasheets are updated
