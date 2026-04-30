-- AI pipeline (Option 2: Next.js -> Cloud Tasks -> Cloud Run -> Vertex Gemini).
-- Step 1: job queue metadata + intake suggestions + return inspection reports.
-- Cloud Run uses Supabase service role (bypasses RLS). App users use library-owner policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type = ANY (ARRAY['intake_autofill'::text, 'return_inspection'::text])),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intake_session_id uuid NULL REFERENCES public.catalog_intake_sessions(id) ON DELETE CASCADE,
  return_session_id uuid NULL REFERENCES public.return_inspection_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text])),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  provider text NOT NULL DEFAULT 'vertex_gemini',
  model text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  cost_estimate numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_job_runs_session_shape CHECK (
    (job_type = 'intake_autofill' AND intake_session_id IS NOT NULL AND return_session_id IS NULL)
    OR (job_type = 'return_inspection' AND return_session_id IS NOT NULL AND intake_session_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ai_job_runs_library_status_created_idx
  ON public.ai_job_runs (library_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_job_runs_intake_session_idx
  ON public.ai_job_runs (intake_session_id)
  WHERE intake_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_job_runs_return_session_idx
  ON public.ai_job_runs (return_session_id)
  WHERE return_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_item_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  intake_session_id uuid NOT NULL REFERENCES public.catalog_intake_sessions(id) ON DELETE CASCADE,
  job_run_id uuid NULL REFERENCES public.ai_job_runs(id) ON DELETE SET NULL,
  suggested_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  chosen_fields jsonb,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_item_suggestions_intake_session_created_idx
  ON public.ai_item_suggestions (intake_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_item_suggestions_library_idx
  ON public.ai_item_suggestions (library_id);

CREATE TABLE IF NOT EXISTS public.ai_return_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  return_session_id uuid NOT NULL REFERENCES public.return_inspection_sessions(id) ON DELETE CASCADE,
  job_run_id uuid NULL REFERENCES public.ai_job_runs(id) ON DELETE SET NULL,
  condition_score integer CHECK (condition_score IS NULL OR (condition_score >= 0 AND condition_score <= 100)),
  condition_label text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_manual_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_return_reports_return_session_created_idx
  ON public.ai_return_reports (return_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_return_reports_library_idx
  ON public.ai_return_reports (library_id);

DROP TRIGGER IF EXISTS ai_job_runs_updated_at ON public.ai_job_runs;
CREATE TRIGGER ai_job_runs_updated_at
  BEFORE UPDATE ON public.ai_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS ai_item_suggestions_updated_at ON public.ai_item_suggestions;
CREATE TRIGGER ai_item_suggestions_updated_at
  BEFORE UPDATE ON public.ai_item_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS ai_return_reports_updated_at ON public.ai_return_reports;
CREATE TRIGGER ai_return_reports_updated_at
  BEFORE UPDATE ON public.ai_return_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.ai_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_item_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_return_reports ENABLE ROW LEVEL SECURITY;

-- Library owner (operator) can manage AI rows for their library.
DROP POLICY IF EXISTS ai_job_runs_select_owner ON public.ai_job_runs;
CREATE POLICY ai_job_runs_select_owner ON public.ai_job_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_job_runs.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_job_runs_insert_owner ON public.ai_job_runs;
CREATE POLICY ai_job_runs_insert_owner ON public.ai_job_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_job_runs.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_job_runs_update_owner ON public.ai_job_runs;
CREATE POLICY ai_job_runs_update_owner ON public.ai_job_runs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_job_runs.library_id AND l.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_job_runs.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_item_suggestions_select_owner ON public.ai_item_suggestions;
CREATE POLICY ai_item_suggestions_select_owner ON public.ai_item_suggestions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_item_suggestions.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_item_suggestions_insert_owner ON public.ai_item_suggestions;
CREATE POLICY ai_item_suggestions_insert_owner ON public.ai_item_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_item_suggestions.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_item_suggestions_update_owner ON public.ai_item_suggestions;
CREATE POLICY ai_item_suggestions_update_owner ON public.ai_item_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_item_suggestions.library_id AND l.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_item_suggestions.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_return_reports_select_owner ON public.ai_return_reports;
CREATE POLICY ai_return_reports_select_owner ON public.ai_return_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_return_reports.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_return_reports_insert_owner ON public.ai_return_reports;
CREATE POLICY ai_return_reports_insert_owner ON public.ai_return_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_return_reports.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ai_return_reports_update_owner ON public.ai_return_reports;
CREATE POLICY ai_return_reports_update_owner ON public.ai_return_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_return_reports.library_id AND l.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_return_reports.library_id AND l.owner_user_id = auth.uid()
    )
  );

COMMIT;
