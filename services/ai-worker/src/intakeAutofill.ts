import { VertexAI } from "@google-cloud/vertexai";
import { createClient } from "@supabase/supabase-js";
import { parseGeminiJson } from "./parseGeminiJson.js";

const INTAKE_SYSTEM_PROMPT = `You are cataloging a toy for a toy library. Analyze the provided images (minimal intake photos). Output ONLY valid JSON, no markdown.

Schema:
{
  "suggested_fields": {
    "name": string (short title, required),
    "description": string | null,
    "category": string | null,
    "brand": string | null,
    "age_min": number | null,
    "age_max": number | null,
    "piece_count": number | null,
    "tags": string[],
    "skills": string[],
    "condition": "new" | "good" | "fair" | "poor" | null,
    "internal_ref": string | null,
    "storage_location": string | null
  },
  "confidence": {
    "name": number (0-1),
    "description": number (0-1),
    "category": number (0-1),
    "brand": number (0-1),
    "age_min": number (0-1),
    "age_max": number (0-1),
    "piece_count": number (0-1),
    "tags": number (0-1),
    "skills": number (0-1),
    "condition": number (0-1)
  },
  "warnings": string[] (e.g. blurry image, label not visible)
}

If unsure, use null and lower confidence. Tags/skills: short lowercase phrases.`;

function guessMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

type IntakeJson = {
  suggested_fields?: Record<string, unknown>;
  confidence?: Record<string, unknown>;
  warnings?: unknown;
};

export async function runIntakeAutofill(jobRunId: string): Promise<{ latencyMs: number; model: string }> {
  const started = Date.now();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? process.env.VERTEX_LOCATION ?? "us-central1";
  const modelId =
    process.env.VERTEX_GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

  if (!supabaseUrl || !supabaseKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (!project) throw new Error("Missing GOOGLE_CLOUD_PROJECT (or GCP_PROJECT_ID)");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: job, error: jobErr } = await supabase
    .from("ai_job_runs")
    .select("id,job_type,status,library_id,intake_session_id")
    .eq("id", jobRunId)
    .maybeSingle();

  if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message ?? ""}`);
  if (job.job_type !== "intake_autofill" || !job.intake_session_id) {
    throw new Error("Invalid job type or missing intake_session_id");
  }

  await supabase.from("ai_job_runs").update({ status: "running", error: null }).eq("id", jobRunId);

  try {
    const { data: photos, error: photoErr } = await supabase
      .from("session_photos")
      .select("shot_key,url")
      .eq("session_type", "intake")
      .eq("intake_session_id", job.intake_session_id);

    if (photoErr) throw new Error(photoErr.message);
    if (!photos?.length) throw new Error("No photos for this intake session");

    const limited = photos.slice(0, 8);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: INTAKE_SYSTEM_PROMPT },
    ];

    for (const row of limited) {
      const { data: blob, error: dlErr } = await supabase.storage.from("toy-images").download(row.url);
      if (dlErr || !blob) {
        console.warn(`Skip photo ${row.url}: ${dlErr?.message ?? "no blob"}`);
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      if (buf.length === 0) continue;
      parts.push({
        inlineData: {
          mimeType: guessMimeFromPath(row.url),
          data: buf.toString("base64"),
        },
      });
    }

    const imageCount = parts.filter((p) => "inlineData" in p).length;
    if (imageCount < 1) {
      throw new Error("Could not download any intake images from toy-images bucket");
    }

    const shotNote = limited.map((p) => `${p.shot_key}: ${p.url}`).join("\n");
    parts.push({
      text: `Shot keys and storage paths (for context only):\n${shotNote}`,
    });

    const vertex = new VertexAI({ project, location });
    const model = vertex.getGenerativeModel({ model: modelId });
    const gen = await model.generateContent({
      contents: [{ role: "user", parts }],
    });

    const text =
      gen.response?.candidates?.[0]?.content?.parts?.map((p) => ("text" in p ? p.text : "")).join("") ?? "";

    if (!text.trim()) throw new Error("Empty model response");

    const parsedRaw = parseGeminiJson(text) as IntakeJson;
    const suggested = parsedRaw.suggested_fields ?? {};
    const confidence = parsedRaw.confidence ?? {};
    const warnings = Array.isArray(parsedRaw.warnings) ? parsedRaw.warnings : [];

    const suggested_fields = {
      ...suggested,
      ai_warnings: warnings,
    };

    const { error: insErr } = await supabase.from("ai_item_suggestions").insert({
      library_id: job.library_id,
      intake_session_id: job.intake_session_id,
      job_run_id: jobRunId,
      suggested_fields,
      confidence: confidence as Record<string, unknown>,
    });

    if (insErr) throw new Error(insErr.message);

    const latencyMs = Date.now() - started;

    await supabase
      .from("ai_job_runs")
      .update({
        status: "succeeded",
        model: modelId,
        latency_ms: latencyMs,
        output: {
          suggestion_saved: true,
          photo_count_used: imageCount,
          warnings,
        },
        error: null,
      })
      .eq("id", jobRunId);

    return { latencyMs, model: modelId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("ai_job_runs")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", jobRunId);
    throw e;
  }
}
