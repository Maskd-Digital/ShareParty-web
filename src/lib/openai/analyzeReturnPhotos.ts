import { CATALOG_TOY_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses";

export type SessionPhotoRow = { shot_key: string; url: string };

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeLabel(raw: unknown): "new" | "good" | "fair" | "poor" {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (s === "new" || s === "good" || s === "fair" || s === "poor") return s;
  return "good";
}

const RETURN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    condition_score: { type: "integer", minimum: 0, maximum: 100 },
    condition_label: { type: "string", enum: ["new", "good", "fair", "poor"] },
    summary: { type: "string" },
    wear_notes: { type: "array", items: { type: "string" } },
    compared_to_catalog: { type: "string" },
    needs_manual_review: { type: "boolean" },
  },
  required: [
    "condition_score",
    "condition_label",
    "summary",
    "wear_notes",
    "compared_to_catalog",
    "needs_manual_review",
  ],
} as const;

const INSTRUCTIONS = `You compare return inspection photos of a borrowed toy to the library's catalog (intake) photos.
Assess visible wear, missing parts, cleanliness, and any new damage vs what the catalog images suggest.
condition_score 0–100 for returned state (0=very worn/damaged, 100=like new). condition_label must align (new≈85–100, good≈50–84, fair≈25–49, poor≈0–24).
If the operator provided an extra verification photo, weight it alongside the member return photos.
needs_manual_review true if you cannot judge confidently (blur, mismatching item, conflicting angles).`;

export type AnalyzeReturnPhotosResult = {
  condition_score: number;
  condition_label: "new" | "good" | "fair" | "poor";
  summary: string;
  wear_notes: string[];
  compared_to_catalog: string;
  needs_manual_review: boolean;
};

async function pushImageContent(
  supabase: SupabaseClient,
  content: ResponseInputMessageContentList,
  label: string,
  storagePath: string,
) {
  const { data: blob, error: dlErr } = await supabase.storage.from(CATALOG_TOY_PHOTOS_BUCKET).download(storagePath);
  if (dlErr || !blob) {
    throw new Error(`Could not download ${label}: ${dlErr?.message ?? "unknown"}`);
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.length === 0) throw new Error(`Empty image for ${label}`);
  const mime = guessMimeFromPath(storagePath);
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  content.push({
    type: "input_text",
    text: label,
  });
  content.push({
    type: "input_image",
    detail: "auto",
    image_url: dataUrl,
  });
}

export async function analyzeReturnPhotos(
  supabase: SupabaseClient,
  opts: {
    returnPhotos: SessionPhotoRow[];
    catalogPaths: string[];
    operatorAddendumPath: string | null;
  },
): Promise<AnalyzeReturnPhotosResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_RETURN_MODEL?.trim() || process.env.OPENAI_INTAKE_MODEL?.trim() || "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: `Member return photos (shot_key order): ${opts.returnPhotos.map((p) => p.shot_key).join(", ")}.\nCatalog reference paths: ${opts.catalogPaths.length} images.\nOperator addendum: ${opts.operatorAddendumPath ? "yes" : "no"}.`,
    },
  ];

  for (const row of opts.returnPhotos) {
    await pushImageContent(supabase, content, `Return photo (${row.shot_key})`, row.url);
  }

  let catIdx = 0;
  for (const path of opts.catalogPaths) {
    catIdx += 1;
    await pushImageContent(supabase, content, `Catalog reference ${catIdx}`, path);
  }

  if (opts.operatorAddendumPath) {
    await pushImageContent(supabase, content, "Operator verification photo", opts.operatorAddendumPath);
  }

  const response = await openai.responses.create({
    model,
    instructions: INSTRUCTIONS,
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
        name: "return_inspection_analysis",
        schema: RETURN_JSON_SCHEMA as unknown as Record<string, unknown>,
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
    condition_score?: unknown;
    condition_label?: unknown;
    summary?: unknown;
    wear_notes?: unknown;
    compared_to_catalog?: unknown;
    needs_manual_review?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("OpenAI returned non-JSON output");
  }

  const wear_notes = Array.isArray(parsed.wear_notes)
    ? parsed.wear_notes
        .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim())
    : [];

  return {
    condition_score: clampScore(parsed.condition_score),
    condition_label: normalizeLabel(parsed.condition_label),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    wear_notes,
    compared_to_catalog:
      typeof parsed.compared_to_catalog === "string" ? parsed.compared_to_catalog.trim() : "",
    needs_manual_review: Boolean(parsed.needs_manual_review),
  };
}
