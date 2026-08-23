import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildUserPrompt,
  parseExtractionResponse,
} from "@/lib/extract/prompt";
import { callProviderExtraction, providerLabel, type AIProvider } from "@/lib/ai-providers";
import { needsReview } from "@/lib/extract/types";

// ═══════════════════════════════════════════════════════════════
// POST /api/extract
//
// Accepts JSON: { fileName, mimeType, base64, provider?, apiKey? }
//
// EPHEMERAL KEY ARCHITECTURE:
//   The API key is sent with each request from the client.
//   It is used for the single extraction call and NEVER stored —
//   not on disk, not in the database, not in logs.
//   It exists only in:
//     1. Browser JS memory (in-memory variable, cleared on refresh)
//     2. TLS-encrypted HTTP request body
//     3. Server request handler memory (ephemeral, GC'd after response)
//
// MULTI-PRODUCT SUPPORT (v0.3):
//   A single document may contain multiple products. The AI
//   returns them in a "products" array and we create a separate
//   Product row for each, all linked to the same source file.
// ═══════════════════════════════════════════════════════════════

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

const VALID_PROVIDERS = new Set<string>([
  "builtin", "openai", "anthropic", "google", "deepseek",
]);

export async function POST(request: Request) {
  try {
    // --- Parse JSON body ---
    let body: {
      fileName?: string; mimeType?: string; base64?: string;
      provider?: string; apiKey?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Send { fileName, mimeType, base64 }." },
        { status: 400 }
      );
    }

    const { fileName, mimeType, base64, provider, apiKey } = body;

    // --- Validate provider ---
    const useProvider: AIProvider = (provider && VALID_PROVIDERS.has(provider))
      ? (provider as AIProvider)
      : "builtin";

    if (useProvider !== "builtin" && (!apiKey || typeof apiKey !== "string")) {
      return NextResponse.json(
        {
          error:
            `No API key provided for ${providerLabel(useProvider)}. ` +
            `Enter your ${providerLabel(useProvider)} API key in Settings before extracting.`,
          code: "NO_API_KEY",
        },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { error: "'fileName' is required and must be a string." },
        { status: 400 }
      );
    }

    if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported mimeType: ${mimeType}. Accepted: ${[...ALLOWED_TYPES].join(", ")}.` },
        { status: 400 }
      );
    }

    if (!base64 || typeof base64 !== "string") {
      return NextResponse.json(
        { error: "'base64' is required and must be a string." },
        { status: 400 }
      );
    }

    const approxSize = Math.floor((base64.length * 3) / 4);
    if (approxSize > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large (~${(approxSize / 1024 / 1024).toFixed(1)}MB). Max 50MB.` },
        { status: 400 }
      );
    }

    // --- Build content parts ---
    const contentParts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file_url"; file_url: { url: string } }
    > = mimeType === "application/pdf"
      ? [
          { type: "text", text: buildUserPrompt(fileName) },
          { type: "file_url", file_url: { url: `data:application/pdf;base64,${base64}` } },
        ]
      : [
          { type: "text", text: buildUserPrompt(fileName) },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ];

    // --- Call VLM (ephemeral key — never stored) ---
    let rawContent: string;
    try {
      const result = await callProviderExtraction(useProvider, apiKey || null, {
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userContent: contentParts,
      });
      rawContent = result.content;
    } catch (aiErr: any) {
      const msg = (aiErr?.message || "Unknown AI provider error")
        .replace(/\.z-ai-config[^\s]*/gi, "configuration")
        .replace(/z-ai-web-dev-sdk[^\s]*/gi, "vision SDK")
        .replace(/z\.ai/gi, "the platform")
        .replace(/ZAI[^\s]*/g, "Vision")
        .replace(/\/etc\//g, "")
        .replace(/\/home\/\S+/g, "");
      console.error(`[extract] AI error (${useProvider}):`, aiErr?.message || msg);
      return NextResponse.json(
        { error: `AI extraction failed: ${msg}`, code: "AI_PROVIDER_ERROR" },
        { status: 502 }
      );
    }

    if (!rawContent) {
      return NextResponse.json(
        { error: "VLM returned an empty response. The file may not contain a readable datasheet." },
        { status: 422 }
      );
    }

    // --- Parse and validate ---
    let extraction;
    try {
      extraction = parseExtractionResponse(rawContent);
    } catch (parseErr: any) {
      return NextResponse.json(
        { error: "Failed to parse extraction results.", detail: parseErr?.message },
        { status: 422 }
      );
    }

    // --- Create products in SQLite (multi-product support) ---
    const createdProducts = [];

    for (const prod of extraction.products) {
      const hasReviewNeeded = prod.fields.some((f) => needsReview(f.confidence));
      const productStatus = hasReviewNeeded ? "needs_review" : "approved";

      const product = await db.product.create({
        data: {
          name: prod.product_name,
          fileName,
          mimeType,
          fileSize: approxSize,
          status: productStatus,
          fields: {
            create: prod.fields.map((f) => ({
              fieldName: f.field,
              value: f.value,
              confidence: f.confidence,
              sourcePage: f.source_page,
              sourceSnippet: f.source_snippet,
              status: needsReview(f.confidence) ? "needs_review" : "approved",
            })),
          },
        },
        include: { fields: true },
      });

      const reviewCount = product.fields.filter(
        (f: { status: string }) => f.status === "needs_review"
      ).length;

      createdProducts.push({
        productId: product.id,
        name: product.name,
        fieldCount: product.fields.length,
        reviewCount,
        status: product.status,
      });
    }

    const isMulti = createdProducts.length > 1;

    return NextResponse.json({
      productCount: createdProducts.length,
      products: createdProducts,
      // Backwards-compatible single-product fields for v0.2 clients
      ...(isMulti ? {} : {
        productId: createdProducts[0].productId,
        name: createdProducts[0].name,
        fieldCount: createdProducts[0].fieldCount,
        reviewCount: createdProducts[0].reviewCount,
        status: createdProducts[0].status,
      }),
    });
  } catch (error: any) {
    console.error("[extract] Error:", error);
    return NextResponse.json(
      { error: "Internal server error during extraction." },
      { status: 500 }
    );
  }
}
