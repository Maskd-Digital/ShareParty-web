-- Operators must be able to SELECT loans for their library (catalog, dashboards).
-- Loan status values (reserved, active, overdue, return_pending, returned, cancelled) are defined on your loans table.

BEGIN;

DROP POLICY IF EXISTS loans_select_operator_library ON public.loans;
CREATE POLICY loans_select_operator_library ON public.loans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.libraries l
      WHERE l.id = loans.library_id
        AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

COMMIT;
