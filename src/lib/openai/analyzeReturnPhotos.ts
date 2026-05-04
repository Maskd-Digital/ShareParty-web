import { CATALOG_TOY_PHOTOS_BUCKET, RETURN_PHOTOS_BUCKET } from "@/lib/catalogStorage";
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

const INSTRUCTIONS_USER_UPLOADS_VS_CATALOG = `The images labeled as user-uploaded returns are member-submitted return inspection photos (stored in the library's return-photos workflow).
Compare those user-uploaded return shots to the library's catalog intake photo set for the same item.
Assess visible wear, missing parts, cleanliness, and any new damage relative to the catalog intake references.
condition_score 0–100 for returned state (0=very worn/damaged, 100=like new). condition_label must align (new≈85–100, good≈50–84, fair≈25–49, poor≈0–24).
needs_manual_review true if you cannot judge confidently (blur, mismatching item, conflicting angles).
In compared_to_catalog, summarize how the user-uploaded return set lines up with the catalog intake references (field id is legacy).`;

const INSTRUCTIONS_USER_UPLOADS_VS_SPOT = `The images labeled as user-uploaded returns are member-submitted return inspection photos from the return-photos workflow.
The on-the-spot images are operator verification photos of the physical toy at return handling.
Compare user-uploaded returns to the on-the-spot set: same item, plausible condition alignment, discrepancies, blur, or angle issues.
condition_score 0–100 for returned state (0=very worn/damaged, 100=like new). condition_label must align (new≈85–100, good≈50–84, fair≈25–49, poor≈0–24).
needs_manual_review true if you cannot judge confidently.
Use compared_to_catalog to summarize user-uploaded returns vs on-the-spot verification (field id is legacy).`;

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
  bucket: string,
) {
  const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
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
    /** If true: user-uploaded return photos vs catalog intake. If false: user-uploaded returns vs on-the-spot operator photo only. */
    compareToCatalog: boolean;
  },
): Promise<AnalyzeReturnPhotosResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = process.env.OPENAI_RETURN_MODEL?.trim() || process.env.OPENAI_INTAKE_MODEL?.trim() || "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const instructions = opts.compareToCatalog ? INSTRUCTIONS_USER_UPLOADS_VS_CATALOG : INSTRUCTIONS_USER_UPLOADS_VS_SPOT;
  const catalogCount = opts.compareToCatalog ? opts.catalogPaths.length : 0;
  const content: ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: opts.compareToCatalog
        ? `User-uploaded return photos (shot_key order): ${opts.returnPhotos.map((p) => p.shot_key).join(", ")}.\nCatalog intake reference images: ${catalogCount}.`
        : `User-uploaded return photos (shot_key order): ${opts.returnPhotos.map((p) => p.shot_key).join(", ")}.\nOn-the-spot operator verification images: ${opts.operatorAddendumPath ? "yes" : "no"}.`,
    },
  ];

  for (const row of opts.returnPhotos) {
    await pushImageContent(
      supabase,
      content,
      `User-uploaded return (${row.shot_key})`,
      row.url,
      RETURN_PHOTOS_BUCKET,
    );
  }

  if (opts.compareToCatalog) {
    let catIdx = 0;
    for (const path of opts.catalogPaths) {
      catIdx += 1;
      await pushImageContent(supabase, content, `Catalog intake reference ${catIdx}`, path, CATALOG_TOY_PHOTOS_BUCKET);
    }
  }

  if (opts.operatorAddendumPath) {
    await pushImageContent(
      supabase,
      content,
      opts.compareToCatalog ? "Operator addendum (optional)" : "On-the-spot operator verification",
      opts.operatorAddendumPath,
      RETURN_PHOTOS_BUCKET,
    );
  }

  const response = await openai.responses.create({
    model,
    instructions,
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
