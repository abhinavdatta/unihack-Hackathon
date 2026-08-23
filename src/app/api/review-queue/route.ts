import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRODUCT_FIELDS } from "@/lib/extract/types";

// ═══════════════════════════════════════════════════════════════
// GET /api/review-queue
//
// Flat list of all fields needing review, across all products.
// This is the primary query for the reviewer UX — it must be
// fast and return everything the reviewer needs in one shot.
//
// DESIGN: Flat, not nested by product. The reviewer processes
// one field at a time. Grouping by product adds navigation
// overhead that causes fatigue.
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  const fields = await db.productField.findMany({
    where: { status: "needs_review" },
    orderBy: [{ confidence: "asc" }, { createdAt: "asc" }],
    include: {
      product: {
        select: { id: true, name: true, fileName: true },
      },
    },
  });

  const enriched = fields.map((f) => {
    const def = PRODUCT_FIELDS.find((p) => p.key === f.fieldName);
    return {
      id: f.id,
      productId: f.product.id,
      productName: f.product.name,
      productFileName: f.product.fileName,
      fieldName: f.fieldName,
      label: def?.label ?? f.fieldName,
      group: def?.group ?? "other",
      value: f.value,
      confidence: f.confidence,
      sourcePage: f.sourcePage,
      sourceSnippet: f.sourceSnippet,
      status: f.status,
    };
  });

  // Summary stats for the queue header
  const total = enriched.length;
  const lowConfidence = enriched.filter((f) => f.confidence < 0.6).length;
  const productIds = new Set(enriched.map((f) => f.productId));

  return NextResponse.json({
    fields: enriched,
    summary: {
      total,
      lowConfidence,
      productCount: productIds.size,
    },
  });
}