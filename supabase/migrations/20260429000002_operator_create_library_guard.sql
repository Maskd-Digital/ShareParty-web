-- Operator-only create_library RPC + stricter RLS insert policy

BEGIN;

-- Update libraries_insert_owner policy to require operator role.
DROP POLICY IF EXISTS libraries_insert_owner ON public.libraries;
CREATE POLICY libraries_insert_owner ON public.libraries
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- Update create_library to:
-- 1) Require operator role
-- 2) Return existing library id instead of failing uniqueness
CREATE OR REPLACE FUNCTION public.create_library(p_library_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'operator'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- If the operator already has a library, reuse it.
  SELECT id INTO lid
  FROM public.libraries
  WHERE owner_user_id = auth.uid()
  LIMIT 1;

  IF lid IS NOT NULL THEN
    RETURN lid;
  END IF;

  INSERT INTO public.libraries (owner_user_id, library_name)
  VALUES (auth.uid(), trim(p_library_name))
  RETURNING id INTO lid;

  -- Create membership for the owner (only if it doesn't already exist).
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND library_id = lid
  ) THEN
    INSERT INTO public.memberships (user_id, library_id)
    VALUES (auth.uid(), lid);
  END IF;

  RETURN lid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_library(text) TO authenticated;

COMMIT;

