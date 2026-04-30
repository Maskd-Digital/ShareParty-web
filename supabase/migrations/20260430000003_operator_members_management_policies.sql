-- Allow library owner (operator) to manage members:
-- - list memberships for their library
-- - insert memberships for other users (onboard existing members)
-- - view basic member profiles for members in their library

BEGIN;

-- memberships: owner can select rows for their library
DROP POLICY IF EXISTS memberships_select_owner_library ON public.memberships;
CREATE POLICY memberships_select_owner_library ON public.memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = memberships.library_id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- memberships: owner can insert memberships for other users (but only for their library)
DROP POLICY IF EXISTS memberships_insert_owner_for_members ON public.memberships;
CREATE POLICY memberships_insert_owner_for_members ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = memberships.library_id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- profiles: owner can select member profiles for members of their library
DROP POLICY IF EXISTS profiles_select_library_owner_members ON public.profiles;
CREATE POLICY profiles_select_library_owner_members ON public.profiles
  FOR SELECT TO authenticated
  USING (
    -- allow the owner to read profiles of users who have a membership in an owned library
    EXISTS (
      SELECT 1
      FROM public.memberships m
      JOIN public.libraries l ON l.id = m.library_id
      WHERE m.user_id = profiles.id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

COMMIT;

