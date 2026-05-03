-- Allow library operators to replace their return-session operator addendum row.

BEGIN;

DROP POLICY IF EXISTS session_photos_delete_return_operator_addendum ON public.session_photos;
CREATE POLICY session_photos_delete_return_operator_addendum ON public.session_photos
  FOR DELETE TO authenticated
  USING (
    session_type = 'return'
    AND shot_key = 'operator_addendum'
    AND EXISTS (
      SELECT 1
      FROM public.return_inspection_sessions s
      JOIN public.libraries l ON l.id = s.library_id
      WHERE s.id = session_photos.return_session_id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator')
  );

COMMIT;
