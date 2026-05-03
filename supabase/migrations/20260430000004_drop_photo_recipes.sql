-- Remove photo recipe tables; intake uses a fixed 3-photo checklist in the app.
-- Sessions no longer reference photo_recipes; toy category is stored on the session.

BEGIN;

ALTER TABLE public.catalog_intake_sessions
  ADD COLUMN IF NOT EXISTS toy_category text;

ALTER TABLE public.catalog_intake_sessions
  DROP COLUMN IF EXISTS recipe_id;

ALTER TABLE public.return_inspection_sessions
  DROP COLUMN IF EXISTS recipe_id;

DROP TABLE IF EXISTS public.photo_recipe_shots CASCADE;
DROP TABLE IF EXISTS public.photo_recipes CASCADE;

COMMIT;
