import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRODUCT_FIELDS } from "@/lib/extract/types";

// ═══════════════════════════════════════════════════════════════
// GET /api/products/[id]
//
// Single product with all fields, sorted by canonical field
// group order (identity → physical → performance → compliance).
// ═══════════════════════════════════════════════════════════════

const GROUP_ORDER = ["identity", "physical", "performance", "compliance"];
const FIELD_ORDER_MAP = new Map(PRODUCT_FIELDS.map((f, i) => [f.key, i]));

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const fields = await db.productField.findMany({
    where: { productId: id },
    orderBy: { createdAt: "asc" },
  });

  // Sort by canonical group order, then by field definition order
  const sorted = [...fields].sort((a, b) => {
    const aGroup = PRODUCT_FIELDS.find((f) => f.key === a.fieldName)?.group ?? "zzz";
    const bGroup = PRODUCT_FIELDS.find((f) => f.key === b.fieldName)?.group ?? "zzz";
    const groupDiff = GROUP_ORDER.indexOf(aGroup) - GROUP_ORDER.indexOf(bGroup);
    if (groupDiff !== 0) return groupDiff;
    return (FIELD_ORDER_MAP.get(a.fieldName) ?? 99) - (FIELD_ORDER_MAP.get(b.fieldName) ?? 99);
  });

  // Enrich fields with label and group
  const enriched = sorted.map((f) => {
    const def = PRODUCT_FIELDS.find((p) => p.key === f.fieldName);
    return {
      id: f.id,
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

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      fileName: product.fileName,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    fields: enriched,
  });
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/products/[id]
//
// Deletes a product and all its fields. Returns deletion counts.
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { count: fieldsCount } = await db.productField.deleteMany({
    where: { productId: id },
  });

  await db.product.delete({
    where: { id },
  });

  return NextResponse.json({
    deleted: { product: 1, fields: fieldsCount },
  });
}