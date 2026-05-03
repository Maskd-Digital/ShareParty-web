-- Members need to upload return inspection photos under `{library_id}/...` without being operators.

BEGIN;

DROP POLICY IF EXISTS storage_toy_photos_insert_member ON storage.objects;
CREATE POLICY storage_toy_photos_insert_member ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toy-photos'
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND split_part(name, '/', 1) = m.library_id::text
    )
  );

COMMIT;
