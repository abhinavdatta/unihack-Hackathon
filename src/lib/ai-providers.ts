import type { VisionMessage } from "z-ai-web-dev-sdk";
import ZAI from "z-ai-web-dev-sdk";

// ═══════════════════════════════════════════════════════════════
// AI Provider Integration
//
// EPHEMERAL KEY ARCHITECTURE:
//   API keys are received per-request, used for a single
//   API call, and NEVER stored — not on disk, not in logs.
//   Key lifetime: browser memory → TLS transit → server
//   handler memory (GC'd after response).
//
//   validateKey() — tests a key against the provider
//   callProviderExtraction() — routes to the correct vision API
// ═══════════════════════════════════════════════════════════════

export type AIProvider = "openai" | "anthropic" | "google" | "deepseek" | "builtin";
export type ExtractableProvider = Exclude<AIProvider, "builtin">;

export interface ExtractionCallParams {
  systemPrompt: string;
  userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "file_url"; file_url: { url: string } }
  >;
}

export interface ExtractionResult {
  content: string;
  provider: string;
  model: string;
}

// ── Helpers ──────────────────────────────────────────────────

export function providerLabel(p: AIProvider): string {
  const labels: Record<AIProvider, string> = {
    builtin: "Built-in",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    google: "Google Gemini",
    deepseek: "DeepSeek",
  };
  return labels[p];
}

/** Parse a data URL into { mediaType, base64Data } */
function parseDataUrl(url: string): { mediaType: string; base64Data: string } {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mediaType: match[1], base64Data: match[2] };
  return { mediaType: "", base64Data: "" };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ── Validation ───────────────────────────────────────────────

/**
 * Validate an API key by making a lightweight API call.
 * Uses the cheapest possible endpoint for each provider.
 */
export async function validateKey(
  provider: ExtractableProvider,
  key: string
): Promise<ValidationResult> {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: "API key is empty" };
  }

  try {
    switch (provider) {
      case "openai":
        return validateOpenAI(key);
      case "anthropic":
        return validateAnthropic(key);
      case "google":
        return validateGoogle(key);
      case "deepseek":
        return validateDeepSeek(key);
      default: {
        const _exhaustive: never = provider;
        return { valid: false, error: `Unknown provider: ${_exhaustive}` };
      }
    }
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || "Connection failed. Check your network.",
    };
  }
}

async function validateOpenAI(key: string): Promise<ValidationResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403)
    return { valid: false, error: "Invalid API key (authentication failed)" };
  if (res.status === 429)
    return { valid: false, error: "Rate limited by OpenAI. Try again shortly." };
  if (!res.ok)
    return { valid: false, error: `OpenAI returned status ${res.status}` };
  return { valid: true };
}

async function validateAnthropic(key: string): Promise<ValidationResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401)
    return { valid: false, error: "Invalid API key (401 Unauthorized)" };
  if (res.status === 429)
    return { valid: false, error: "Rate limited by Anthropic. Try again shortly." };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `Anthropic returned status ${res.status}`;
    return { valid: false, error: msg };
  }
  return { valid: true };
}

async function validateGoogle(key: string): Promise<ValidationResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (res.status === 400 || res.status === 403)
    return { valid: false, error: "Invalid API key" };
  if (!res.ok)
    return { valid: false, error: `Google returned status ${res.status}` };
  return { valid: true };
}

async function validateDeepSeek(key: string): Promise<ValidationResult> {
  const res = await fetch("https://api.deepseek.com/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401)
    return { valid: false, error: "Invalid API key (401 Unauthorized)" };
  if (res.status === 429)
    return { valid: false, error: "Rate limited by DeepSeek. Try again shortly." };
  if (!res.ok)
    return { valid: false, error: `DeepSeek returned status ${res.status}` };
  return { valid: true };
}

// ── Extraction (Vision) ──────────────────────────────────────

/**
 * Main extraction entry point.
 * Takes provider and key directly from the request (ephemeral).
 * The key is used for this single call and NEVER stored.
 */
export async function callProviderExtraction(
  provider: AIProvider,
  apiKey: string | null,
  params: ExtractionCallParams
): Promise<ExtractionResult> {
  if (provider === "builtin") {
    return callBuiltinVision(params);
  }

  if (!apiKey) {
    throw new Error(
      `No API key provided for ${providerLabel(provider)}. `
    );
  }

  switch (provider) {
    case "openai":
      return callOpenAIVision(params, apiKey);
    case "anthropic":
      return callAnthropicVision(params, apiKey);
    case "google":
      return callGoogleVision(params, apiKey);
    case "deepseek":
      return callDeepSeekVision(params, apiKey);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}

// ── Built-in Vision ─────────────────────────────────────────

/** Strip any internal platform references from error messages before sending to the client. */
function sanitizeError(err: any): Error {
  const raw = err?.message || String(err);
 // Remove file paths, config names, and platform identifiers that should never reach the user
  const clean = raw
    .replace(/\.z-ai-config[^\s]*/gi, "configuration")
    .replace(/z-ai-web-dev-sdk[^\s]*/gi, "vision SDK")
    .replace(/z\.ai/gi, "the platform")
    .replace(/ZAI[^\s]*/g, "Vision")
    .replace(/\/etc\//g, "")
    .replace(/\/home\/[^\s]+/g, "");
  return new Error(clean);
}

async function callBuiltinVision(
  params: ExtractionCallParams
): Promise<ExtractionResult> {
  let zai;
  try {
    zai = await ZAI.create();
  } catch (err: any) {
    throw sanitizeError(err);
  }
  const messages: VisionMessage[] = [
    { role: "assistant", content: params.systemPrompt },
    { role: "user", content: params.userContent as any },
  ];
  let response;
  try {
    response = await zai.chat.completions.createVision({
      messages,
      thinking: { type: "disabled" },
      model: "default",
    });
  } catch (err: any) {
    throw sanitizeError(err);
  }
  const content = response.choices?.[0]?.message?.content;
  if (!content)
    throw new Error("Built-in vision model returned an empty response.");
  return { content, provider: "builtin", model: "platform-default" };
}

// ── OpenAI (GPT-4o) ──────────────────────────────────────────

async function callOpenAIVision(
  params: ExtractionCallParams,
  key: string
): Promise<ExtractionResult> {
  const messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }> = [
    { role: "system", content: params.systemPrompt },
    {
      role: "user",
      content: params.userContent.map((item) => {
        if (item.type === "text")
          return { type: "text" as const, text: item.text };
        // OpenAI uses image_url for both images and PDFs
        const url =
          item.image_url?.url ||
          (item as any).file_url?.url ||
          "";
        return { type: "image_url" as const, image_url: { url } };
      }),
    },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4o", messages, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120000),
  });

  if (res.status === 401) throw new Error("OpenAI API key is invalid (401).");
  if (res.status === 429)
    throw new Error("OpenAI rate limit exceeded. Try again later.");
  if (res.status === 402)
    throw new Error("OpenAI billing issue — check your account credits.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `OpenAI API error: ${res.status}`
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");
  return { content, provider: "openai", model: "gpt-4o" };
}

// ── Anthropic (Claude) ───────────────────────────────────────

async function callAnthropicVision(
  params: ExtractionCallParams,
  key: string
): Promise<ExtractionResult> {
  const anthropicContent: Array<{
    type: string;
    text?: string;
    source?: { type: string; media_type: string; data: string };
  }> = [];

  for (const item of params.userContent) {
    if (item.type === "text") {
      anthropicContent.push({ type: "text", text: item.text });
    } else if (item.type === "image_url") {
      const url = item.image_url?.url || "";
      const { mediaType, base64Data } = parseDataUrl(url);
      anthropicContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType || "image/png",
          data: base64Data,
        },
      });
    } else if (item.type === "file_url") {
      const url = (item as any).file_url?.url || "";
      const { mediaType, base64Data } = parseDataUrl(url);
      if (mediaType === "application/pdf") {
        anthropicContent.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64Data,
          },
        });
      }
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: [{ role: "user", content: anthropicContent }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (res.status === 401)
    throw new Error("Anthropic API key is invalid (401).");
  if (res.status === 429)
    throw new Error("Anthropic rate limit exceeded. Try again later.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Anthropic API error: ${res.status}`
    );
  }

  const data = await res.json();
  const textBlocks = data.content?.filter((b: any) => b.type === "text");
  const content = textBlocks?.map((b: any) => b.text).join("") || "";
  if (!content) throw new Error("Anthropic returned an empty response.");
  return { content, provider: "anthropic", model: "claude-sonnet-4" };
}

// ── Google Gemini ────────────────────────────────────────────

async function callGoogleVision(
  params: ExtractionCallParams,
  key: string
): Promise<ExtractionResult> {
  const parts: Array<
    { text?: string; inlineData?: { mimeType: string; data: string } }
  > = [];

  for (const item of params.userContent) {
    if (item.type === "text") {
      parts.push({ text: item.text });
    } else if (item.type === "image_url") {
      const url = item.image_url?.url || "";
      const { mediaType, base64Data } = parseDataUrl(url);
      parts.push({
        inlineData: { mimeType: mediaType || "image/png", data: base64Data },
      });
    } else if (item.type === "file_url") {
      const url = (item as any).file_url?.url || "";
      const { mediaType, base64Data } = parseDataUrl(url);
      parts.push({
        inlineData: {
          mimeType: mediaType || "application/pdf",
          data: base64Data,
        },
      });
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(120000),
    }
  );

  if (res.status === 400 || res.status === 403)
    throw new Error("Google API key is invalid or lacks vision permissions.");
  if (res.status === 429)
    throw new Error("Google rate limit exceeded. Try again later.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Google API error: ${res.status}`
    );
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text)
    .join("");
  if (!content) throw new Error("Gemini returned an empty response.");
  return { content, provider: "google", model: "gemini-2.0-flash" };
}

// ── DeepSeek ─────────────────────────────────────────────────

async function callDeepSeekVision(
  params: ExtractionCallParams,
  key: string
): Promise<ExtractionResult> {
  // DeepSeek follows OpenAI-compatible API format
  const messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }> = [
    { role: "system", content: params.systemPrompt },
    {
      role: "user",
      content: params.userContent.map((item) => {
        if (item.type === "text")
          return { type: "text" as const, text: item.text };
        const url =
          item.image_url?.url ||
          (item as any).file_url?.url ||
          "";
        return { type: "image_url" as const, image_url: { url } };
      }),
    },
  ];

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (res.status === 401)
    throw new Error("DeepSeek API key is invalid (401).");
  if (res.status === 429)
    throw new Error("DeepSeek rate limit exceeded. Try again later.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `DeepSeek API error: ${res.status}`
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response.");
  return { content, provider: "deepseek", model: "deepseek-chat" };
}
