import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// DELETE /api/data — clear all products and fields
// ═══════════════════════════════════════════════════════════════

export async function DELETE() {
  try {
    const fieldsDeleted = await db.productField.deleteMany({});
    const productsDeleted = await db.product.deleteMany({});

    return NextResponse.json({
      deleted: {
        products: productsDeleted.count,
        fields: fieldsDeleted.count,
      },
    });
  } catch (error: any) {
    console.error("[data] Clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear data." },
      { status: 500 }
    );
  }
}
