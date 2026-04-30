-- Reduce photo recipes to minimal shot sets (operator/member friendly)

BEGIN;

-- Replace all seeded shots for our 5 global categories (intake + return) with a minimal checklist.
WITH recipes AS (
  SELECT r.id, r.mode, r.category
  FROM public.photo_recipes r
  WHERE r.scope = 'global'
    AND r.is_active = true
    AND r.version = 1
    AND r.category = ANY (ARRAY['puzzles','construction','board_games','pretend_play','electronic_toy'])
    AND r.mode = ANY (ARRAY['intake','return'])
),
deleted AS (
  DELETE FROM public.photo_recipe_shots s
  USING recipes r
  WHERE s.recipe_id = r.id
  RETURNING s.recipe_id
)
INSERT INTO public.photo_recipe_shots (recipe_id, shot_key, label, instructions, framing, required, min_photos, max_photos, sort_order)
SELECT * FROM (
  -- PUZZLES (intake): minimal = hero + topdown all pieces; optional label
  SELECT (SELECT id FROM recipes WHERE category='puzzles' AND mode='intake'), 'hero', 'Hero', 'Full item centered; neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='puzzles' AND mode='intake'), 'topdown_parts', 'All pieces (top-down)', 'Lay out all pieces clearly; avoid overlap.', 'top_down', true, 1, 2, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='puzzles' AND mode='intake'), 'label', 'Label/brand (optional)', 'Close-up of brand/label/barcode if present.', 'close_up', false, 1, 1, 30

  -- PUZZLES (return): minimal = topdown all pieces + damage closeups (optional)
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='puzzles' AND mode='return'), 'topdown_parts', 'All pieces (top-down)', 'Lay out all returned pieces clearly; avoid overlap.', 'top_down', true, 1, 2, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='puzzles' AND mode='return'), 'damage', 'Damage close-up (optional)', 'If damaged, take a clear close-up.', 'close_up', false, 1, 3, 20

  -- CONSTRUCTION (intake): minimal = hero + topdown parts; optional manual
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='construction' AND mode='intake'), 'hero', 'Hero', 'Full set centered; neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='construction' AND mode='intake'), 'topdown_parts', 'Parts (top-down)', 'Lay out parts; if many, group into piles.', 'top_down', true, 1, 3, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='construction' AND mode='intake'), 'manual', 'Manual (optional)', 'Capture instruction cover/page if present.', 'close_up', false, 1, 1, 30

  -- CONSTRUCTION (return): minimal = topdown parts; optional damage closeups
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='construction' AND mode='return'), 'topdown_parts', 'All parts (top-down)', 'Lay out all returned parts clearly.', 'top_down', true, 1, 3, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='construction' AND mode='return'), 'damage', 'Damage close-up (optional)', 'Any cracks/broken connectors close-up.', 'close_up', false, 1, 4, 20

  -- BOARD GAMES (intake): minimal = box front + components layout; optional rules
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='board_games' AND mode='intake'), 'hero', 'Box front', 'Box front or main game view.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='board_games' AND mode='intake'), 'components', 'Components (top-down)', 'Lay out components: board + pieces + cards.', 'top_down', true, 1, 3, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='board_games' AND mode='intake'), 'rules', 'Rules (optional)', 'Capture rules cover/page if present.', 'close_up', false, 1, 1, 30

  -- BOARD GAMES (return): minimal = components layout; optional damage closeups
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='board_games' AND mode='return'), 'components', 'Components (top-down)', 'Lay out all returned components.', 'top_down', true, 1, 3, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='board_games' AND mode='return'), 'damage', 'Damage close-up (optional)', 'Worn cards/board folds close-up if any.', 'close_up', false, 1, 4, 20

  -- PRETEND PLAY (intake): minimal = hero; optional accessories topdown + label
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='intake'), 'hero', 'Hero', 'Full toy centered; neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='intake'), 'accessories', 'Accessories (optional)', 'Lay out accessories top-down if present.', 'top_down', false, 1, 2, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='intake'), 'label', 'Label (optional)', 'Brand/model close-up if present.', 'close_up', false, 1, 1, 30

  -- PRETEND PLAY (return): minimal = hero; optional accessories + damage
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='return'), 'hero', 'Hero', 'Full toy centered; neutral background.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='return'), 'accessories', 'Accessories (optional)', 'Returned accessories top-down if any.', 'top_down', false, 1, 2, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='pretend_play' AND mode='return'), 'damage', 'Damage close-up (optional)', 'Any broken parts close-up.', 'close_up', false, 1, 3, 30

  -- ELECTRONIC TOY (intake): minimal = hero + battery compartment
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='electronic_toy' AND mode='intake'), 'hero', 'Hero', 'Full toy centered.', 'front', true, 1, 1, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='electronic_toy' AND mode='intake'), 'battery', 'Battery compartment', 'Close-up of battery door/contacts.', 'close_up', true, 1, 2, 20
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='electronic_toy' AND mode='intake'), 'label', 'Label (optional)', 'Model/serial/brand close-up if present.', 'close_up', false, 1, 1, 30

  -- ELECTRONIC TOY (return): minimal = battery compartment; optional damage
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='electronic_toy' AND mode='return'), 'battery', 'Battery compartment', 'Close-up to check corrosion/damage.', 'close_up', true, 1, 2, 10
  UNION ALL SELECT (SELECT id FROM recipes WHERE category='electronic_toy' AND mode='return'), 'damage', 'Damage close-up (optional)', 'Cracks/loose parts/corrosion close-up.', 'close_up', false, 1, 4, 20
) s(recipe_id, shot_key, label, instructions, framing, required, min_photos, max_photos, sort_order)
WHERE s.recipe_id IS NOT NULL;

COMMIT;

