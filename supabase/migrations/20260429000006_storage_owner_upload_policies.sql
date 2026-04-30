-- Allow library owners (operators) to upload/select storage objects
-- even if a memberships row is missing.

BEGIN;

DROP POLICY IF EXISTS storage_toy_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_toy_images_insert ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_insert ON storage.objects;

-- Helper predicates (inline): user has membership for library_id == first path segment
-- OR user is the library owner for that library_id.

CREATE POLICY storage_toy_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'toy-images'
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND split_part(name, '/', 1) = m.library_id::text
      )
      OR EXISTS (
        SELECT 1 FROM public.libraries l
        WHERE l.owner_user_id = auth.uid()
          AND split_part(name, '/', 1) = l.id::text
      )
    )
  );

CREATE POLICY storage_toy_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toy-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND split_part(name, '/', 1) = m.library_id::text
      )
      OR EXISTS (
        SELECT 1 FROM public.libraries l
        WHERE l.owner_user_id = auth.uid()
          AND split_part(name, '/', 1) = l.id::text
      )
    )
  );

CREATE POLICY storage_return_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'return-images'
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND split_part(name, '/', 1) = m.library_id::text
      )
      OR EXISTS (
        SELECT 1 FROM public.libraries l
        WHERE l.owner_user_id = auth.uid()
          AND split_part(name, '/', 1) = l.id::text
      )
    )
  );

CREATE POLICY storage_return_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'return-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND split_part(name, '/', 1) = m.library_id::text
      )
      OR EXISTS (
        SELECT 1 FROM public.libraries l
        WHERE l.owner_user_id = auth.uid()
          AND split_part(name, '/', 1) = l.id::text
      )
    )
  );

COMMIT;

