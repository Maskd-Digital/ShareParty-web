-- Optional 0–100 condition score for borrowing display (intake meter / future edits).

BEGIN;

ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS condition_score integer
  CHECK (condition_score IS NULL OR (condition_score >= 0 AND condition_score <= 100));

COMMIT;
