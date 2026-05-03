/**
 * Fixed intake checklist: every toy category uses the same three photos.
 * `shot_key` is stable for storage paths and `session_photos`.
 */
export type IntakeShot = {
  shot_key: string;
  label: string;
  instructions: string;
  framing: string;
  required: boolean;
  min_photos: number;
  max_photos: number;
  sort_order: number;
};

export const FIXED_INTAKE_SHOTS: IntakeShot[] = [
  {
    shot_key: "photo_1",
    label: "Photo 1 — Whole item",
    instructions: "Center the full toy in frame on a neutral background. Good lighting, no heavy shadows.",
    framing: "front",
    required: true,
    min_photos: 1,
    max_photos: 1,
    sort_order: 10,
  },
  {
    shot_key: "photo_2",
    label: "Photo 2 — Important detail",
    instructions: "Close-up of brand, label, barcode, or key parts (e.g. pieces, controls, box corner).",
    framing: "close_up",
    required: true,
    min_photos: 1,
    max_photos: 1,
    sort_order: 20,
  },
  {
    shot_key: "photo_3",
    label: "Photo 3 — Context / contents",
    instructions: "Show packaging open, contents laid out, or how it looks from another angle (your choice).",
    framing: "any",
    required: true,
    min_photos: 1,
    max_photos: 1,
    sort_order: 30,
  },
];

export function intakeChecklistCopy(categoryLabel: string): { title: string; description: string } {
  return {
    title: `Intake — ${categoryLabel}`,
    description:
      "All categories use the same three photos. Upload one image for each step so cataloging and AI stay consistent.",
  };
}
