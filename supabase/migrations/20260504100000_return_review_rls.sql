-- Return inspection: member can submit (update own session); operator can update sessions in their library.
-- Extra session_photos INSERT so operators can add a return-review photo.
-- Optional review outcome when the session is closed.

BEGIN;

ALTER TABLE public.return_inspection_sessions
  ADD COLUMN IF NOT EXISTS review_outcome text
  CHECK (review_outcome IS NULL OR review_outcome = ANY (ARRAY['approved'::text, 'damaged'::text]));

DROP POLICY IF EXISTS return_inspection_sessions_update_member_own ON public.return_inspection_sessions;
CREATE POLICY return_inspection_sessions_update_member_own ON public.return_inspection_sessions
  FOR UPDATE TO authenticated
  USING (member_user_id = auth.uid())
  WITH CHECK (member_user_id = auth.uid());

DROP POLICY IF EXISTS return_inspection_sessions_update_operator_library ON public.return_inspection_sessions;
CREATE POLICY return_inspection_sessions_update_operator_library ON public.return_inspection_sessions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = return_inspection_sessions.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = return_inspection_sessions.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS session_photos_insert_return_operator ON public.session_photos;
CREATE POLICY session_photos_insert_return_operator ON public.session_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    session_type = 'return'
    AND EXISTS (
      SELECT 1
      FROM public.return_inspection_sessions s
      JOIN public.libraries l ON l.id = s.library_id
      WHERE s.id = session_photos.return_session_id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator')
  );

-- Operators could not read return session_photos before operator_user_id was set (policy only allowed member or session.operator).
DROP POLICY IF EXISTS session_photos_select ON public.session_photos;
CREATE POLICY session_photos_select ON public.session_photos
  FOR SELECT TO authenticated
  USING (
    (session_type = 'intake' AND EXISTS (
      SELECT 1 FROM public.catalog_intake_sessions s WHERE s.id = session_photos.intake_session_id AND s.operator_user_id = auth.uid()
    ))
    OR
    (session_type = 'return' AND EXISTS (
      SELECT 1 FROM public.return_inspection_sessions s
      WHERE s.id = session_photos.return_session_id
        AND (
          s.member_user_id = auth.uid()
          OR s.operator_user_id = auth.uid()
          OR (
            EXISTS (SELECT 1 FROM public.libraries l WHERE l.id = s.library_id AND l.owner_user_id = auth.uid())
            AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator')
          )
        )
    ))
  );

COMMIT;
