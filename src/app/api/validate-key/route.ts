import { NextResponse } from "next/server";
import { validateKey, type ExtractableProvider } from "@/lib/ai-providers";

// ═══════════════════════════════════════════════════════════════
// POST /api/validate-key
//
// Test an API key WITHOUT storing it.
// Body: { provider, key }
// The key is used for a single validation call, then discarded.
// ═══════════════════════════════════════════════════════════════

const VALID = new Set(["openai", "anthropic", "google", "deepseek"]);

export async function POST(request: Request) {
  try {
    let body: { provider?: string; key?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { provider, key } = body;
    if (!provider || !VALID.has(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Use: ${[...VALID].join(", ")}` },
        { status: 400 }
      );
    }
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return NextResponse.json({ valid: false, error: "API key is required" });
    }

    const result = await validateKey(provider as ExtractableProvider, key.trim());
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[validate-key] Error:", error?.message);
    return NextResponse.json(
      { valid: false, error: "Validation failed. Check your network." },
      { status: 500 }
    );
  }
}
