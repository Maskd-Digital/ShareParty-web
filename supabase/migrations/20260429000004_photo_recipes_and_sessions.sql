-- Dynamic photo recipes + intake/return sessions

BEGIN;

-- Ensure updated_at trigger function exists (some environments may not have earlier migrations applied yet).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Photo recipes: data-driven prompts for intake/return workflows.
CREATE TABLE IF NOT EXISTS public.photo_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'global' CHECK (scope = ANY (ARRAY['global','library'])),
  mode text NOT NULL CHECK (mode = ANY (ARRAY['intake','return'])),
  category text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, mode, category, version, library_id)
);

CREATE TABLE IF NOT EXISTS public.photo_recipe_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.photo_recipes(id) ON DELETE CASCADE,
  shot_key text NOT NULL,
  label text NOT NULL,
  instructions text NOT NULL,
  framing text NOT NULL DEFAULT 'any' CHECK (framing = ANY (ARRAY['any','front','back','side','top_down','close_up'])),
  required boolean NOT NULL DEFAULT true,
  min_photos integer NOT NULL DEFAULT 1 CHECK (min_photos >= 1),
  max_photos integer NOT NULL DEFAULT 1 CHECK (max_photos >= min_photos),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, shot_key)
);

-- Sessions: capture an instance of a recipe run (intake or return).
CREATE TABLE IF NOT EXISTS public.catalog_intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  operator_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NULL REFERENCES public.library_items(id) ON DELETE SET NULL,
  recipe_id uuid NOT NULL REFERENCES public.photo_recipes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','submitted','complete','failed'])),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_inspection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operator_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.photo_recipes(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','submitted','complete','failed'])),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type text NOT NULL CHECK (session_type = ANY (ARRAY['intake','return'])),
  intake_session_id uuid NULL REFERENCES public.catalog_intake_sessions(id) ON DELETE CASCADE,
  return_session_id uuid NULL REFERENCES public.return_inspection_sessions(id) ON DELETE CASCADE,
  shot_key text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_photos_one_parent CHECK (
    (session_type = 'intake' AND intake_session_id IS NOT NULL AND return_session_id IS NULL)
    OR (session_type = 'return' AND return_session_id IS NOT NULL AND intake_session_id IS NULL)
  )
);

-- updated_at triggers
DROP TRIGGER IF EXISTS photo_recipes_updated_at ON public.photo_recipes;
CREATE TRIGGER photo_recipes_updated_at BEFORE UPDATE ON public.photo_recipes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS catalog_intake_sessions_updated_at ON public.catalog_intake_sessions;
CREATE TRIGGER catalog_intake_sessions_updated_at BEFORE UPDATE ON public.catalog_intake_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS return_inspection_sessions_updated_at ON public.return_inspection_sessions;
CREATE TRIGGER return_inspection_sessions_updated_at BEFORE UPDATE ON public.return_inspection_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.photo_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_recipe_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_inspection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;

-- Helpers via policy EXISTS checks
-- Recipes: global readable by authenticated; library-scoped readable by library owner/operator.
DROP POLICY IF EXISTS photo_recipes_select ON public.photo_recipes;
CREATE POLICY photo_recipes_select ON public.photo_recipes
  FOR SELECT TO authenticated
  USING (
    scope = 'global'
    OR (
      scope = 'library'
      AND library_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.libraries l
        WHERE l.id = photo_recipes.library_id AND l.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS photo_recipe_shots_select ON public.photo_recipe_shots;
CREATE POLICY photo_recipe_shots_select ON public.photo_recipe_shots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.photo_recipes r
      WHERE r.id = photo_recipe_shots.recipe_id
      AND (
        r.scope = 'global'
        OR EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = r.library_id AND l.owner_user_id = auth.uid())
      )
    )
  );

-- Sessions: operator owns intake sessions; member owns return sessions; operator can read return sessions for their library.
DROP POLICY IF EXISTS catalog_intake_sessions_select ON public.catalog_intake_sessions;
CREATE POLICY catalog_intake_sessions_select ON public.catalog_intake_sessions
  FOR SELECT TO authenticated
  USING (operator_user_id = auth.uid());

DROP POLICY IF EXISTS catalog_intake_sessions_write ON public.catalog_intake_sessions;
CREATE POLICY catalog_intake_sessions_write ON public.catalog_intake_sessions
  FOR ALL TO authenticated
  USING (operator_user_id = auth.uid())
  WITH CHECK (operator_user_id = auth.uid());

DROP POLICY IF EXISTS return_inspection_sessions_select_member ON public.return_inspection_sessions;
CREATE POLICY return_inspection_sessions_select_member ON public.return_inspection_sessions
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS return_inspection_sessions_select_operator ON public.return_inspection_sessions;
CREATE POLICY return_inspection_sessions_select_operator ON public.return_inspection_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = return_inspection_sessions.library_id AND l.owner_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator')
  );

DROP POLICY IF EXISTS return_inspection_sessions_write_member ON public.return_inspection_sessions;
CREATE POLICY return_inspection_sessions_write_member ON public.return_inspection_sessions
  FOR INSERT TO authenticated
  WITH CHECK (member_user_id = auth.uid());

-- Session photos: can be read/written by session owner(s).
DROP POLICY IF EXISTS session_photos_select ON public.session_photos;
CREATE POLICY session_photos_select ON public.session_photos
  FOR SELECT TO authenticated
  USING (
    (session_type = 'intake' AND EXISTS (
      SELECT 1 FROM public.catalog_intake_sessions s WHERE s.id = session_photos.intake_session_id AND s.operator_user_id = auth.uid()
    ))
    OR
    (session_type = 'return' AND EXISTS (
      SELECT 1 FROM public.return_inspection_sessions s WHERE s.id = session_photos.return_session_id AND (s.member_user_id = auth.uid() OR s.operator_user_id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS session_photos_insert ON public.session_photos;
CREATE POLICY session_photos_insert ON public.session_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    (session_type = 'intake' AND EXISTS (
      SELECT 1 FROM public.catalog_intake_sessions s WHERE s.id = session_photos.intake_session_id AND s.operator_user_id = auth.uid()
    ))
    OR
    (session_type = 'return' AND EXISTS (
      SELECT 1 FROM public.return_inspection_sessions s WHERE s.id = session_photos.return_session_id AND s.member_user_id = auth.uid()
    ))
  );

-- Seed 5 global recipes (intake + return) with consistent shot keys.
-- Categories: puzzles, construction, board_games, pretend_play, electronic_toy
WITH r AS (
  INSERT INTO public.photo_recipes (scope, mode, category, version, title, description, is_active)
  VALUES
    ('global','intake','puzzles',1,'Puzzles (Intake)','Standard photos for puzzles intake',true),
    ('global','return','puzzles',1,'Puzzles (Return)','Standard photos for puzzles return inspection',true),
    ('global','intake','construction',1,'Construction sets (Intake)','Standard photos for construction sets intake',true),
    ('global','return','construction',1,'Construction sets (Return)','Standard photos for construction sets return inspection',true),
    ('global','intake','board_games',1,'Board games (Intake)','Standard photos for board games intake',true),
    ('global','return','board_games',1,'Board games (Return)','Standard photos for board games return inspection',true),
    ('global','intake','pretend_play',1,'Pretend play (Intake)','Standard photos for pretend play intake',true),
    ('global','return','pretend_play',1,'Pretend play (Return)','Standard photos for pretend play return inspection',true),
    ('global','intake','electronic_toy',1,'Electronic toys (Intake)','Standard photos for electronic toys intake',true),
    ('global','return','electronic_toy',1,'Electronic toys (Return)','Standard photos for electronic toys return inspection',true)
  RETURNING id, mode, category
)
INSERT INTO public.photo_recipe_shots (recipe_id, shot_key, label, instructions, framing, required, min_photos, max_photos, sort_order)
SELECT * FROM (
  -- Puzzles intake
  SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='intake'), 'hero', 'Hero (front)', 'Full item centered, neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='intake'), 'back', 'Back', 'Full item back side.', 'back', true, 1, 1, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='intake'), 'topdown_parts', 'Top-down (all pieces)', 'Lay out all pieces clearly; avoid overlap.', 'top_down', true, 1, 3, 30
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='intake'), 'label', 'Label/brand', 'Close-up of brand/label/barcode if present.', 'close_up', false, 1, 2, 40

  -- Puzzles return
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='return'), 'hero', 'Hero (front)', 'Full item centered, neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='return'), 'topdown_parts', 'Top-down (all pieces)', 'Lay out all returned pieces clearly.', 'top_down', true, 1, 3, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='puzzles' AND mode='return'), 'wear_closeup', 'Wear points', 'Close-up of corners/edges if worn.', 'close_up', false, 1, 3, 30

  -- Construction intake
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='intake'), 'hero', 'Hero (front)', 'Full set centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='intake'), 'topdown_parts', 'Top-down (sorted parts)', 'Sort into piles if many pieces.', 'top_down', true, 1, 5, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='intake'), 'manual', 'Manual/instructions', 'Capture instruction cover/page if present.', 'close_up', false, 1, 2, 30
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='intake'), 'label', 'Label/brand', 'Close-up of brand/model text.', 'close_up', false, 1, 2, 40

  -- Construction return
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='return'), 'hero', 'Hero (front)', 'Full set centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='return'), 'topdown_parts', 'Top-down (all parts)', 'Lay out all returned parts clearly.', 'top_down', true, 1, 5, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='construction' AND mode='return'), 'wear_closeup', 'Wear points', 'Close-up of connectors that show wear.', 'close_up', false, 1, 4, 30

  -- Board games intake
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='intake'), 'hero', 'Hero (front)', 'Box front or main game view.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='intake'), 'back', 'Back', 'Box back or rear view.', 'back', true, 1, 1, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='intake'), 'components', 'Components layout', 'Lay out all components: cards, pieces, board.', 'top_down', true, 1, 5, 30
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='intake'), 'manual', 'Rules/manual', 'Capture rules cover/page if present.', 'close_up', false, 1, 2, 40

  -- Board games return
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='return'), 'hero', 'Hero (front)', 'Box front or main game view.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='return'), 'components', 'Components layout', 'Lay out all returned components.', 'top_down', true, 1, 5, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='board_games' AND mode='return'), 'wear_closeup', 'Wear points', 'Close-up of card corners/board folds.', 'close_up', false, 1, 4, 30

  -- Pretend play intake
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='intake'), 'hero', 'Hero (front)', 'Full toy centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='intake'), 'back', 'Back', 'Rear view.', 'back', false, 1, 1, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='intake'), 'topdown_parts', 'Top-down (accessories)', 'Lay out any accessories separately.', 'top_down', false, 1, 4, 30
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='intake'), 'label', 'Label/brand', 'Close-up of label/brand if present.', 'close_up', false, 1, 2, 40

  -- Pretend play return
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='return'), 'hero', 'Hero (front)', 'Full toy centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='return'), 'topdown_parts', 'Top-down (accessories)', 'Lay out returned accessories.', 'top_down', false, 1, 4, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='pretend_play' AND mode='return'), 'wear_closeup', 'Wear points', 'Close-up of joints/handles/fasteners.', 'close_up', false, 1, 4, 30

  -- Electronic toy intake
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='intake'), 'hero', 'Hero (front)', 'Full toy centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='intake'), 'back', 'Back', 'Rear view.', 'back', true, 1, 1, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='intake'), 'battery', 'Battery compartment', 'Close-up of battery door + contacts.', 'close_up', true, 1, 2, 30
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='intake'), 'controls', 'Buttons/switches', 'Close-up of controls.', 'close_up', false, 1, 3, 40
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='intake'), 'label', 'Label/brand', 'Close-up of model/serial if present.', 'close_up', false, 1, 2, 50

  -- Electronic toy return
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='return'), 'hero', 'Hero (front)', 'Full toy centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='return'), 'battery', 'Battery compartment', 'Close-up of battery area to check corrosion/damage.', 'close_up', true, 1, 2, 20
  UNION ALL SELECT (SELECT id FROM r WHERE category='electronic_toy' AND mode='return'), 'wear_closeup', 'Damage close-ups', 'Any cracks, loose parts, or corrosion.', 'close_up', false, 1, 5, 30
) s(recipe_id, shot_key, label, instructions, framing, required, min_photos, max_photos, sort_order);

COMMIT;

