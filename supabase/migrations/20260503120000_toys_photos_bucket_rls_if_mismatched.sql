-- Idempotent: canonical bucket is `toy-photos`. Drop legacy `toys-photos` policy names if they exist, then ensure `toy-photos` RLS.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('toy-photos', 'toy-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS storage_toy_photos_select ON storage.objects;
DROP POLICY IF EXISTS storage_toy_photos_insert ON storage.objects;
DROP POLICY IF EXISTS storage_toys_photos_select ON storage.objects;
DROP POLICY IF EXISTS storage_toys_photos_insert ON storage.objects;

CREATE POLICY storage_toy_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'toy-photos'
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

CREATE POLICY storage_toy_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toy-photos'
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
