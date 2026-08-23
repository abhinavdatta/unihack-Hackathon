import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// PATCH /api/fields/[id]
//
// Approve, edit, or reject a field. After updating, recalculate
// the parent product's status.
//
// DESIGN: Single-field updates keep the reviewer in flow.
// No batch endpoint needed for the primary interaction — the
// reviewer processes one at a time and moves on.
// ═══════════════════════════════════════════════════════════════

const VALID_STATUSES = new Set(["approved", "edited", "rejected"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, value } = body as { status?: string; value?: string };

  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(", ")}` },
      { status: 400 }
    );
  }

  if (status === "edited" && (!value || typeof value !== "string" || !value.trim())) {
    return NextResponse.json(
      { error: "When status is 'edited', a non-empty 'value' must be provided." },
      { status: 400 }
    );
  }

  // Find the field
  const field = await db.productField.findUnique({ where: { id } });
  if (!field) {
    return NextResponse.json({ error: "Field not found" }, { status: 404 });
  }

  // Update the field
  const updated = await db.productField.update({
    where: { id },
    data: {
      status,
      ...(status === "edited" && value ? { value: value.trim() } : {}),
    },
  });

  // Recalculate parent product status
  await recalcProductStatus(field.productId);

  return NextResponse.json({
    id: updated.id,
    fieldName: updated.fieldName,
    value: updated.value,
    confidence: updated.confidence,
    sourcePage: updated.sourcePage,
    sourceSnippet: updated.sourceSnippet,
    status: updated.status,
  });
}

async function recalcProductStatus(productId: string) {
  const remaining = await db.productField.count({
    where: { productId, status: "needs_review" },
  });

  const allRejected = await db.productField.count({
    where: { productId, status: "rejected" },
  });
  const allFields = await db.productField.count({
    where: { productId },
  });

  let newStatus: string;
  if (remaining > 0) {
    newStatus = "needs_review";
  } else if (allRejected === allFields) {
    newStatus = "needs_review"; // all rejected = still needs attention
  } else {
    newStatus = "approved";
  }

  await db.product.update({
    where: { id: productId },
    data: { status: newStatus },
  });
}