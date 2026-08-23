import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRODUCT_FIELDS } from "@/lib/extract/types";

// ═══════════════════════════════════════════════════════════════
// POST /api/export/[id]
//
// Export a product as schema.org-style JSON.
// Only includes approved or edited fields.
// ═══════════════════════════════════════════════════════════════

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = await db.product.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const fields = await db.productField.findMany({
    where: {
      productId: id,
      status: { in: ["approved", "edited"] },
    },
  });

  // Build schema.org Product
  const additionalProps = fields
    .filter((f) => !["product_name", "manufacturer", "description", "category"].includes(f.fieldName))
    .map((f) => {
      const def = PRODUCT_FIELDS.find((p) => p.key === f.fieldName);
      return {
        "@type": "PropertyValue",
        name: def?.label ?? f.fieldName,
        value: f.value,
      };
    });

  const nameField = fields.find((f) => f.fieldName === "product_name");
  const mfrField = fields.find((f) => f.fieldName === "manufacturer");
  const descField = fields.find((f) => f.fieldName === "description");
  const catField = fields.find((f) => f.fieldName === "category");
  const modelField = fields.find((f) => f.fieldName === "model_number");

  const output: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: nameField?.value ?? product.name,
  };

  if (mfrField) output.manufacturer = mfrField.value;
  if (modelField) output.model = modelField.value;
  if (descField) output.description = descField.value;
  if (catField) output.category = catField.value;
  if (additionalProps.length > 0) output.additionalProperty = additionalProps;

  // Mark as completed
  await db.product.update({
    where: { id },
    data: { status: "completed" },
  });

  return NextResponse.json(output);
}