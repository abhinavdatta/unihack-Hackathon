import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════
// GET /api/products
//
// List all products with field counts and review counts.
// ?status= filter by product status.
// ═══════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, string> = {};
  if (status) where.status = status;

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          fields: true,
        },
      },
    },
  });

  // Enrich with needs_review count
  const enriched = await Promise.all(
    products.map(async (p) => {
      const reviewCount = await db.productField.count({
        where: { productId: p.id, status: "needs_review" },
      });
      return {
        id: p.id,
        name: p.name,
        fileName: p.fileName,
        status: p.status,
        fieldCount: p._count.fields,
        reviewCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    })
  );

  return NextResponse.json({ products: enriched });
}
