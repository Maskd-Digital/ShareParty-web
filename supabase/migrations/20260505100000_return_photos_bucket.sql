-- Return inspection media: bucket `return-photos` (matches `RETURN_PHOTOS_BUCKET` default in app).
-- Object keys: `{library_id}/returns/{session_id}/...` (see ReturnPhotosClient / ReturnReviewClient).

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('return-photos', 'return-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS authenticated_select_return_photos ON storage.objects;
DROP POLICY IF EXISTS authenticated_upload_return_photos ON storage.objects;
DROP POLICY IF EXISTS public_read_return_photos ON storage.objects;

CREATE POLICY authenticated_select_return_photos ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'return-photos'
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

CREATE POLICY authenticated_upload_return_photos ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'return-photos'
    AND split_part(name, '/', 2) = 'returns'
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND split_part(name, '/', 1) = m.library_id::text
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'operator'
        )
        AND EXISTS (
          SELECT 1 FROM public.libraries l
          WHERE l.owner_user_id = auth.uid()
            AND split_part(name, '/', 1) = l.id::text
        )
      )
    )
  );

CREATE POLICY public_read_return_photos ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'return-photos');

COMMIT;
