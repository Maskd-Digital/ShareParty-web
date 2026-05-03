export type CategoryId = "puzzles" | "construction" | "board_games" | "pretend_play" | "electronic_toy";

export const INTAKE_CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "puzzles", label: "Puzzles" },
  { id: "construction", label: "Construction sets" },
  { id: "board_games", label: "Board games" },
  { id: "pretend_play", label: "Pretend play" },
  { id: "electronic_toy", label: "Electronic toys" },
];

export type DraftFields = {
  name: string;
  description: string;
  category: string;
  brand: string;
  age_min: string;
  age_max: string;
  piece_count: string;
  condition: string;
  condition_score: string;
};

export function emptyDraft(): DraftFields {
  return {
    name: "",
    description: "",
    category: "",
    brand: "",
    age_min: "",
    age_max: "",
    piece_count: "",
    condition: "good",
    condition_score: "65",
  };
}

export function conditionFromScore(score: number): string {
  if (score < 25) return "poor";
  if (score < 50) return "fair";
  if (score < 80) return "good";
  return "new";
}

export function midpointScoreForCondition(cond: string): number {
  if (cond === "poor") return 12;
  if (cond === "fair") return 37;
  if (cond === "good") return 65;
  return 90;
}

export function clampScoreStr(s: string, fallback: number): string {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.max(0, Math.min(100, n)));
}

export function draftFromSuggestion(sf: Record<string, unknown>): DraftFields {
  const condRaw = typeof sf.condition === "string" ? sf.condition : "good";
  const cond = ["new", "good", "fair", "poor"].includes(condRaw) ? condRaw : "good";
  const csRaw = sf.condition_score != null ? Number(sf.condition_score) : midpointScoreForCondition(cond);
  const cs = Number.isFinite(csRaw) ? Math.max(0, Math.min(100, Math.round(csRaw))) : midpointScoreForCondition(cond);

  const cat = typeof sf.category === "string" ? sf.category : "";
  return {
    name: typeof sf.name === "string" ? sf.name : "",
    description: typeof sf.description === "string" ? sf.description : "",
    category: cat,
    brand: typeof sf.brand === "string" ? sf.brand : "",
    age_min: sf.age_min != null ? String(sf.age_min) : "",
    age_max: sf.age_max != null ? String(sf.age_max) : "",
    piece_count: sf.piece_count != null ? String(sf.piece_count) : "",
    condition: cond,
    condition_score: String(cs),
  };
}

export function draftToFieldsPayload(d: DraftFields): Record<string, unknown> {
  const age_min = d.age_min.trim() ? parseInt(d.age_min, 10) : null;
  const age_max = d.age_max.trim() ? parseInt(d.age_max, 10) : null;
  const piece_count = d.piece_count.trim() ? parseInt(d.piece_count, 10) : null;
  const condition_score = d.condition_score.trim() ? parseInt(d.condition_score, 10) : null;
  return {
    name: d.name.trim() || "Untitled toy",
    description: d.description.trim() || null,
    category: d.category.trim() || null,
    brand: d.brand.trim() || null,
    age_min: Number.isFinite(age_min) ? age_min : null,
    age_max: Number.isFinite(age_max) ? age_max : null,
    piece_count: Number.isFinite(piece_count) ? piece_count : null,
    condition: d.condition,
    condition_score: Number.isFinite(condition_score) ? condition_score : null,
  };
}

export function isCategoryId(s: string): s is CategoryId {
  return INTAKE_CATEGORIES.some((c) => c.id === s);
}
