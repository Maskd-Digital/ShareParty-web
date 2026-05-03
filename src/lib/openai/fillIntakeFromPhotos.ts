import { CATALOG_TOY_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { Response, ResponseInputMessageContentList } from "openai/resources/responses/responses";

const VALID_CATEGORIES = new Set([
  "puzzles",
  "construction",
  "board_games",
  "pretend_play",
  "electronic_toy",
]);

export type SessionPhotoRow = { shot_key: string; url: string };

export type FillIntakeSource = { title: string; url: string };

export type FillIntakeFromPhotosResult = {
  suggested_fields: Record<string, unknown>;
  confidence: Record<string, unknown>;
  warnings: string[];
  sources: FillIntakeSource[];
};

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function normalizeCategory(raw: unknown, fallback: string): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s && VALID_CATEGORIES.has(s)) return s;
  if (fallback && VALID_CATEGORIES.has(fallback)) return fallback;
  return null;
}

function normalizeCondition(raw: unknown): "new" | "good" | "fair" | "poor" {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === "new" || s === "good" || s === "fair" || s === "poor") return s;
  return "good";
}

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return 65;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** Pull URLs from web_search_call items when `include` returns sources. */
function sourcesFromResponseOutput(output: Response["output"]): FillIntakeSource[] {
  const out: FillIntakeSource[] = [];
  for (const item of output ?? []) {
    if (item.type !== "web_search_call") continue;
    const action = item.action;
    if (!action || action.type !== "search") continue;
    const sources = "sources" in action ? action.sources : undefined;
    if (!Array.isArray(sources)) continue;
    for (const s of sources) {
      if (s && typeof s === "object" && "url" in s && typeof (s as { url?: string }).url === "string") {
        const url = (s as { url: string }).url;
        if (url) out.push({ title: url, url });
      }
    }
  }
  return dedupeSources(out);
}

function dedupeSources(sources: FillIntakeSource[]): FillIntakeSource[] {
  const seen = new Set<string>();
  const r: FillIntakeSource[] = [];
  for (const s of sources) {
    const u = s.url.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    r.push({ title: s.title?.trim() || u, url: u });
  }
  return r;
}

const INTAKE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggested_fields: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        description: { type: "string", description: "Empty string if unknown" },
        category: { type: "string", description: "One of the five ids or empty if unknown" },
        brand: { type: "string", description: "Empty string if unknown" },
        age_min: { type: "integer", minimum: -1, maximum: 99, description: "-1 if unknown" },
        age_max: { type: "integer", minimum: -1, maximum: 99, description: "-1 if unknown" },
        piece_count: { type: "integer", minimum: -1, maximum: 999999, description: "-1 if unknown" },
        condition: { type: "string", enum: ["new", "good", "fair", "poor"] },
        condition_score: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: [
        "name",
        "description",
        "category",
        "brand",
        "age_min",
        "age_max",
        "piece_count",
        "condition",
        "condition_score",
      ],
    },
    confidence: {
      type: "object",
      additionalProperties: { type: "number" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "url"],
      },
    },
  },
  required: ["suggested_fields", "confidence", "warnings", "sources"],
} as const;

const DEVELOPER_PROMPT = `You are cataloging a toy for a toy lending library (borrowing-focused metadata only).
Use the provided intake photos. Use web search when it helps identify the product (brand, official name, age range, piece count).
Return JSON matching the schema exactly. Be conservative: if unsure, use empty string for unknown text fields, -1 for unknown age_min/age_max/piece_count, and lower confidence scores.
condition_score is 0-100 from visible wear in the photos (0=very worn, 100=like new). condition must align (new≈85-100, good≈50-84, fair≈25-49, poor≈0-24).
category must be one of: puzzles, construction, board_games, pretend_play, electronic_toy — or null if unclear.
sources: cite 0-8 reputable URLs you actually used from web search (title + url).`;

/**
 * Downloads intake images from Supabase Storage and calls OpenAI (vision + web search) synchronously.
 */
export async function fillIntakeFromPhotos(
  supabase: SupabaseClient,
  photos: SessionPhotoRow[],
  toyCategory: string,
): Promise<FillIntakeFromPhotosResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_INTAKE_MODEL?.trim() || "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: `Operator-selected toy_category (fallback): ${toyCategory}\n\nThere are ${photos.length} photos in order; keys: ${photos.map((p) => p.shot_key).join(", ")}.`,
    },
  ];

  for (const row of photos) {
    const { data: blob, error: dlErr } = await supabase.storage.from(CATALOG_TOY_PHOTOS_BUCKET).download(row.url);
    if (dlErr || !blob) {
      throw new Error(`Could not download photo ${row.shot_key}: ${dlErr?.message ?? "unknown error"}`);
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.length === 0) throw new Error(`Empty image for ${row.shot_key}`);
    const mime = guessMimeFromPath(row.url);
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    content.push({
      type: "input_image",
      detail: "auto",
      image_url: dataUrl,
    });
  }

  const response = await openai.responses.create({
    model,
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
    instructions: DEVELOPER_PROMPT,
    input: [
      {
        type: "message",
        role: "user",
        content,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "intake_borrow_metadata",
        schema: INTAKE_JSON_SCHEMA as unknown as Record<string, unknown>,
        strict: false,
      },
    },
    store: false,
  });

  if (response.error) {
    throw new Error(response.error.message ?? "OpenAI response error");
  }

  const raw = response.output_text?.trim();
  if (!raw) throw new Error("Empty OpenAI output");

  let parsed: {
    suggested_fields?: Record<string, unknown>;
    confidence?: Record<string, unknown>;
    warnings?: unknown;
    sources?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("OpenAI returned non-JSON output");
  }

  const sf = parsed.suggested_fields ?? {};
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w): w is string => typeof w === "string") : [];
  const modelSources = Array.isArray(parsed.sources)
    ? parsed.sources
        .filter((s): s is { title: string; url: string } => {
          return (
            s !== null &&
            typeof s === "object" &&
            typeof (s as { title?: string }).title === "string" &&
            typeof (s as { url?: string }).url === "string"
          );
        })
        .map((s) => ({ title: s.title, url: s.url }))
    : [];

  const fromOutput = sourcesFromResponseOutput(response.output);
  const sources = dedupeSources([...modelSources, ...fromOutput]);

  const condition = normalizeCondition(sf.condition);
  const condition_score = clampScore(sf.condition_score);
  const category = normalizeCategory(sf.category, toyCategory);

  const descRaw = typeof sf.description === "string" ? sf.description.trim() : "";
  const brandRaw = typeof sf.brand === "string" ? sf.brand.trim() : "";
  const ageMin = typeof sf.age_min === "number" && Number.isFinite(sf.age_min) && sf.age_min >= 0 ? sf.age_min : null;
  const ageMax = typeof sf.age_max === "number" && Number.isFinite(sf.age_max) && sf.age_max >= 0 ? sf.age_max : null;
  const pieceCount =
    typeof sf.piece_count === "number" && Number.isFinite(sf.piece_count) && sf.piece_count >= 0 ? sf.piece_count : null;

  const suggested_fields: Record<string, unknown> = {
    name: typeof sf.name === "string" && sf.name.trim() ? sf.name.trim() : "Untitled toy",
    description: descRaw || null,
    category,
    brand: brandRaw || null,
    age_min: ageMin,
    age_max: ageMax,
    piece_count: pieceCount,
    condition,
    condition_score,
    sources,
    ai_warnings: warnings,
  };

  const confidence =
    parsed.confidence && typeof parsed.confidence === "object" && !Array.isArray(parsed.confidence)
      ? (parsed.confidence as Record<string, unknown>)
      : {};

  return {
    suggested_fields,
    confidence,
    warnings,
    sources,
  };
}
