import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// POST /api/review-queue/bulk
//
// Bulk approve/reject for power reviewers. Body:
// { actions: [{ fieldId, status, value? }] }
// Recalculates affected product statuses after.
// ═══════════════════════════════════════════════════════════════

const VALID_STATUSES = new Set(["approved", "edited", "rejected"]);

export async function POST(request: Request) {
  const body = await request.json();
  const { actions } = body as {
    actions: Array<{ fieldId: string; status: string; value?: string }>;
  };

  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty 'actions' array." },
      { status: 400 }
    );
  }

  const affectedProductIds = new Set<string>();
  let updated = 0;

  for (const action of actions) {
    if (!VALID_STATUSES.has(action.status)) continue;

    const field = await db.productField.findUnique({
      where: { id: action.fieldId },
    });
    if (!field) continue;

    await db.productField.update({
      where: { id: action.fieldId },
      data: {
        status: action.status,
        ...(action.status === "edited" && action.value
          ? { value: action.value.trim() }
          : {}),
      },
    });

    affectedProductIds.add(field.productId);
    updated++;
  }

  // Recalc affected products
  for (const productId of affectedProductIds) {
    const remaining = await db.productField.count({
      where: { productId, status: "needs_review" },
    });
    const allFields = await db.productField.count({
      where: { productId },
    });
    const allRejected = await db.productField.count({
      where: { productId, status: "rejected" },
    });

    let newStatus: string;
    if (remaining > 0) {
      newStatus = "needs_review";
    } else if (allRejected === allFields) {
      newStatus = "needs_review";
    } else {
      newStatus = "approved";
    }

    await db.product.update({
      where: { id: productId },
      data: { status: newStatus },
    });
  }

  return NextResponse.json({ updated });
}