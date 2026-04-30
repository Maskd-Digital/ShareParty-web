/**
 * Gemini often returns JSON wrapped in markdown fences or with leading prose.
 */
export function parseGeminiJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const inner = fence ? fence[1].trim() : trimmed;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  const slice = inner.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}
