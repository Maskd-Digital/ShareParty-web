-- Member portal: RLS fixes, membership fee fields, join-card RPC, membership_requests policies.

BEGIN;

-- Library membership fee (minor units, e.g. cents)
ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS membership_fee_amount integer NOT NULL DEFAULT 0
    CHECK (membership_fee_amount >= 0);

ALTER TABLE public.libraries
  ADD COLUMN IF NOT EXISTS membership_fee_currency text NOT NULL DEFAULT 'NZD'
    CHECK (char_length(TRIM(BOTH FROM membership_fee_currency)) >= 3 AND char_length(TRIM(BOTH FROM membership_fee_currency)) <= 10);

-- membership_requests policies
DROP POLICY IF EXISTS membership_requests_select_own ON public.membership_requests;
CREATE POLICY membership_requests_select_own ON public.membership_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS membership_requests_select_operator ON public.membership_requests;
CREATE POLICY membership_requests_select_operator ON public.membership_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = membership_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

DROP POLICY IF EXISTS membership_requests_insert_own ON public.membership_requests;
CREATE POLICY membership_requests_insert_own ON public.membership_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS membership_requests_update_operator ON public.membership_requests;
CREATE POLICY membership_requests_update_operator ON public.membership_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = membership_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = membership_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS membership_requests_one_pending_per_user_library
  ON public.membership_requests (user_id, library_id)
  WHERE status = 'pending';

-- member_children: allow any member to insert own children
DROP POLICY IF EXISTS member_children_insert_own ON public.member_children;
CREATE POLICY member_children_insert_own ON public.member_children
  FOR INSERT TO authenticated
  WITH CHECK (member_user_id = auth.uid());

-- loan_requests: operator can select for their library
DROP POLICY IF EXISTS loan_requests_select_operator ON public.loan_requests;
CREATE POLICY loan_requests_select_operator ON public.loan_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = loan_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- loan_requests: member can cancel pending
DROP POLICY IF EXISTS loan_requests_update_member_cancel ON public.loan_requests;
CREATE POLICY loan_requests_update_member_cancel ON public.loan_requests
  FOR UPDATE TO authenticated
  USING (member_user_id = auth.uid() AND status = 'pending')
  WITH CHECK (member_user_id = auth.uid() AND status = 'cancelled');

-- membership_payments: member can read own via membership
DROP POLICY IF EXISTS membership_payments_select_member ON public.membership_payments;
CREATE POLICY membership_payments_select_member ON public.membership_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = membership_payments.membership_id AND m.user_id = auth.uid()
    )
  );

-- Public join card for library lookup (no Stripe secrets)
CREATE OR REPLACE FUNCTION public.get_library_join_card(p_library_id uuid)
RETURNS TABLE (
  id uuid,
  library_name text,
  city text,
  country text,
  description text,
  requires_paid_membership boolean,
  membership_fee_amount integer,
  membership_fee_currency text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    l.id,
    l.library_name,
    l.city,
    l.country,
    l.description,
    l.requires_paid_membership,
    l.membership_fee_amount,
    l.membership_fee_currency,
    l.status
  FROM public.libraries l
  WHERE l.id = p_library_id
    AND l.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_library_join_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_join_card(uuid) TO authenticated;

COMMIT;
