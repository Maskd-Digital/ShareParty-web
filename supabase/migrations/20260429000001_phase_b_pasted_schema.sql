-- ShareParty Phase B: Align to provided pasted schema (catalog/cart/loans/etc)
-- Reset-safe: drops existing Phase A tables/functions and recreates everything.

BEGIN;

-- Extensions for UUID generation (gen_random_uuid()).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop storage policies that depend on Phase A tables.
-- (Using IF EXISTS so this migration can be re-run locally without failing.)
DROP POLICY IF EXISTS storage_toy_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_toy_images_insert ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_insert ON storage.objects;

-- Drop Phase A enums.
DROP TYPE IF EXISTS public.library_role;
DROP TYPE IF EXISTS public.billing_mode;

-- Drop Phase A tables (with CASCADE to remove dependent policies/triggers).
DROP TABLE IF EXISTS public.ai_intake_jobs CASCADE;
DROP TABLE IF EXISTS public.cart_items CASCADE;
DROP TABLE IF EXISTS public.loan_requests CASCADE;
DROP TABLE IF EXISTS public.loans CASCADE;
DROP TABLE IF EXISTS public.library_items CASCADE;
DROP TABLE IF EXISTS public.library_memberships CASCADE;
DROP TABLE IF EXISTS public.libraries CASCADE;
DROP TABLE IF EXISTS public.library_items CASCADE;
DROP TABLE IF EXISTS public.member_children CASCADE;
DROP TABLE IF EXISTS public.membership_payments CASCADE;
DROP TABLE IF EXISTS public.membership_requests CASCADE;
DROP TABLE IF EXISTS public.memberships CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.waitlist_entries CASCADE;
DROP TABLE IF EXISTS public.children CASCADE;

-- Drop old functions used by Phase A.
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.touch_updated_at();
DROP FUNCTION IF EXISTS public.normalise_library_slug(text);
DROP FUNCTION IF EXISTS public.create_library(text, text);

-- Create tables from the pasted schema.

-- Profiles (1:1 with auth.users)
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text CHECK (full_name IS NULL OR char_length(TRIM(BOTH FROM full_name)) <= 100),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['operator'::text, 'member'::text])),
  phone_number text,
  date_of_birth date,
  street_address text,
  suburb text,
  city text,
  postal_code text,
  country text,
  avatar_url text,
  notification_email boolean DEFAULT true,
  notification_push boolean DEFAULT true,
  setls_id text,
  terms_accepted_at timestamp with time zone,
  marketing_opt_in boolean DEFAULT false,
  expo_push_token text,
  last_known_latitude numeric DEFAULT NULL::numeric,
  last_known_longitude numeric DEFAULT NULL::numeric,
  location_updated_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- Libraries
CREATE TABLE public.libraries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE,
  library_name text NOT NULL CHECK (char_length(TRIM(BOTH FROM library_name)) >= 1 AND char_length(TRIM(BOTH FROM library_name)) <= 120),
  country text CHECK (country IS NULL OR char_length(TRIM(BOTH FROM country)) <= 80),
  city text CHECK (city IS NULL OR char_length(TRIM(BOTH FROM city)) <= 80),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  requires_paid_membership boolean NOT NULL DEFAULT false,
  stripe_account_id text CHECK (stripe_account_id IS NULL OR char_length(TRIM(BOTH FROM stripe_account_id)) <= 255),
  postal_code text,
  phone_number text,
  contact_email text,
  description text,
  cover_image_url text,
  street_address text,
  suburb text,
  is_setls_member boolean NOT NULL DEFAULT false,
  max_items_per_member integer NOT NULL DEFAULT 3,
  loan_period_days integer NOT NULL DEFAULT 14,
  renewals_allowed boolean NOT NULL DEFAULT false,
  late_return_policy text,
  opening_hours jsonb NOT NULL DEFAULT '{
    "friday": { "open": "09:00", "close": "17:00", "closed": false },
    "monday": { "open": "09:00", "close": "17:00", "closed": false },
    "sunday": { "closed": true },
    "tuesday": { "open": "09:00", "close": "17:00", "closed": false },
    "saturday": { "open": "10:00", "close": "14:00", "closed": false },
    "thursday": { "open": "09:00", "close": "17:00", "closed": false },
    "wednesday": { "open": "09:00", "close": "17:00", "closed": false }
  }'::jsonb,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'retired'::text, 'suspended'::text])),
  late_fee_enabled boolean DEFAULT false,
  late_fee_type text DEFAULT 'per_day'::text CHECK (late_fee_type = ANY (ARRAY['per_day'::text, 'per_hour'::text])),
  late_fee_amount numeric DEFAULT 0.00,
  late_fee_currency text DEFAULT 'NZD'::text,
  late_fee_grace_period_hours integer DEFAULT 0,
  late_fee_max_amount numeric DEFAULT NULL::numeric,
  latitude numeric DEFAULT NULL::numeric,
  longitude numeric DEFAULT NULL::numeric,
  CONSTRAINT libraries_pkey PRIMARY KEY (id),
  CONSTRAINT libraries_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id)
);

-- Library items
CREATE TABLE public.library_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 200),
  description text CHECK (description IS NULL OR char_length(description) <= 4000),
  category text CHECK (category IS NULL OR char_length(TRIM(BOTH FROM category)) <= 80),
  image_url text CHECK (image_url IS NULL OR char_length(TRIM(BOTH FROM image_url)) <= 2048),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  availability_status text NOT NULL DEFAULT 'available'::text CHECK (availability_status = ANY (ARRAY['available'::text, 'on_loan'::text, 'reserved'::text, 'under_inspection'::text, 'retired'::text])),
  photo_urls ARRAY DEFAULT '{}'::text[],
  ai_status text DEFAULT 'draft'::text CHECK (ai_status = ANY (ARRAY['draft'::text, 'pending_ai_review'::text, 'processing'::text, 'review_needed'::text, 'complete'::text])),
  ai_raw_response jsonb,
  brand text,
  age_min integer,
  age_max integer,
  piece_count integer,
  replacement_cost numeric,
  condition text DEFAULT 'good'::text CHECK (condition = ANY (ARRAY['new'::text, 'good'::text, 'fair'::text, 'poor'::text])),
  tags ARRAY DEFAULT '{}'::text[],
  skills ARRAY DEFAULT '{}'::text[],
  internal_ref text,
  storage_location text,
  CONSTRAINT library_items_pkey PRIMARY KEY (id),
  CONSTRAINT library_items_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id)
);

-- Member children (COPPA-oriented)
CREATE TABLE public.member_children (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_user_id uuid NOT NULL,
  first_name text NOT NULL,
  birth_year integer NOT NULL CHECK (birth_year >= 2000 AND birth_year::numeric <= EXTRACT(year FROM now())),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT member_children_pkey PRIMARY KEY (id),
  CONSTRAINT member_children_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES public.profiles(id)
);

-- Memberships
CREATE TABLE public.memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  library_id uuid NOT NULL,
  membership_id text,
  source text NOT NULL DEFAULT 'shareparty'::text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'free'::text CHECK (payment_status = ANY (ARRAY['free'::text, 'pending'::text, 'paid'::text, 'failed'::text])),
  CONSTRAINT memberships_pkey PRIMARY KEY (id),
  CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT memberships_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id)
);

-- Membership requests
CREATE TABLE public.membership_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  library_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  phone_number text,
  address text,
  note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT membership_requests_pkey PRIMARY KEY (id),
  CONSTRAINT membership_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT membership_requests_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id),
  CONSTRAINT membership_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);

-- Membership payments
CREATE TABLE public.membership_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  stripe_payment_intent_id text,
  amount integer NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (char_length(TRIM(BOTH FROM currency)) >= 3 AND char_length(TRIM(BOTH FROM currency)) <= 10),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT membership_payments_pkey PRIMARY KEY (id),
  CONSTRAINT membership_payments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id)
);

-- Cart items
CREATE TABLE public.cart_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  library_id uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT cart_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id),
  CONSTRAINT cart_items_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id)
);

-- Loan requests / loans
CREATE TABLE public.loan_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL,
  item_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])),
  member_note text,
  operator_note text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  loan_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '48:00:00'::interval),
  CONSTRAINT loan_requests_pkey PRIMARY KEY (id),
  CONSTRAINT loan_requests_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id),
  CONSTRAINT loan_requests_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id),
  CONSTRAINT loan_requests_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES public.profiles(id),
  CONSTRAINT loan_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id),
  CONSTRAINT loan_requests_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id)
);

CREATE TABLE public.loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL,
  item_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'overdue'::text, 'returned'::text, 'cancelled'::text])),
  due_date timestamp with time zone NOT NULL,
  returned_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT loans_pkey PRIMARY KEY (id),
  CONSTRAINT loans_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id),
  CONSTRAINT loans_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id),
  CONSTRAINT loans_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES public.profiles(id),
  CONSTRAINT loans_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.profiles(id)
);

-- Waitlist
CREATE TABLE public.waitlist_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL,
  item_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting'::text CHECK (status = ANY (ARRAY['waiting'::text, 'promoted'::text, 'cancelled'::text, 'notified'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  position integer NOT NULL,
  CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id),
  CONSTRAINT waitlist_entries_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id),
  CONSTRAINT waitlist_entries_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES public.profiles(id),
  CONSTRAINT waitlist_entries_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id)
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['loan_approved'::text, 'loan_declined'::text, 'loan_due_reminder'::text, 'loan_overdue'::text, 'waitlist_available'::text, 'membership_approved'::text, 'system'::text])),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  sent_push boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- AI intake jobs
CREATE TABLE public.ai_intake_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  library_id uuid NOT NULL,
  photo_urls ARRAY NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'queued'::text CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'complete'::text, 'failed'::text])),
  ai_response jsonb,
  error_message text,
  queued_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_intake_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_intake_jobs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.library_items(id),
  CONSTRAINT ai_intake_jobs_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id)
);

-- Auto-create profile row on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- updated_at triggers
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS libraries_updated_at ON public.libraries;
CREATE TRIGGER libraries_updated_at BEFORE UPDATE ON public.libraries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS library_items_updated_at ON public.library_items;
CREATE TRIGGER library_items_updated_at BEFORE UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS loan_requests_updated_at ON public.loan_requests;
CREATE TRIGGER loan_requests_updated_at BEFORE UPDATE ON public.loan_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS loans_updated_at ON public.loans;
CREATE TRIGGER loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS membership_payments_updated_at ON public.membership_payments;
CREATE TRIGGER membership_payments_updated_at BEFORE UPDATE ON public.membership_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS membership_requests_updated_at ON public.membership_requests;
CREATE TRIGGER membership_requests_updated_at BEFORE UPDATE ON public.membership_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS memberships_updated_at ON public.memberships;
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS ai_intake_jobs_updated_at ON public.ai_intake_jobs;
CREATE TRIGGER ai_intake_jobs_updated_at BEFORE UPDATE ON public.ai_intake_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS waitlist_entries_updated_at ON public.waitlist_entries;
CREATE TRIGGER waitlist_entries_updated_at BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed storage buckets (Phase A used these for toy/return images).
INSERT INTO storage.buckets (id, name, public)
VALUES ('toy-images', 'toy-images', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
VALUES ('return-images', 'return-images', false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_intake_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_payments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Libraries policies (operator updates are owner_only + profile.role='operator')
DROP POLICY IF EXISTS libraries_select_member ON public.libraries;
CREATE POLICY libraries_select_member ON public.libraries
  FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.library_id = libraries.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS libraries_update_operator_owner_only ON public.libraries;
CREATE POLICY libraries_update_operator_owner_only ON public.libraries
  FOR UPDATE TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

DROP POLICY IF EXISTS libraries_insert_owner ON public.libraries;
CREATE POLICY libraries_insert_owner ON public.libraries
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Membership policies
DROP POLICY IF EXISTS memberships_select_own ON public.memberships;
CREATE POLICY memberships_select_own ON public.memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS memberships_update_own ON public.memberships;
CREATE POLICY memberships_update_own ON public.memberships
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS memberships_insert_owner_only ON public.memberships;
CREATE POLICY memberships_insert_owner_only ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = memberships.library_id AND l.owner_user_id = auth.uid()
    )
  );

-- Member children policies
DROP POLICY IF EXISTS member_children_select_own ON public.member_children;
CREATE POLICY member_children_select_own ON public.member_children
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS member_children_insert_own ON public.member_children;
CREATE POLICY member_children_insert_own ON public.member_children
  FOR INSERT TO authenticated
  WITH CHECK (
    member_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
      AND m.library_id = (SELECT l.id FROM public.libraries l WHERE l.owner_user_id = auth.uid() LIMIT 1)
    )
  );

-- NOTE: The schema pasted for member_children does not include library_id, so we can only
-- scope by member_user_id here. (App currently assumes operator==member, and only inserts own rows.)
DROP POLICY IF EXISTS member_children_update_own ON public.member_children;
CREATE POLICY member_children_update_own ON public.member_children
  FOR UPDATE TO authenticated
  USING (member_user_id = auth.uid())
  WITH CHECK (member_user_id = auth.uid());

DROP POLICY IF EXISTS member_children_delete_own ON public.member_children;
CREATE POLICY member_children_delete_own ON public.member_children
  FOR DELETE TO authenticated
  USING (member_user_id = auth.uid());

-- Library items policies (operator owner-only writes)
DROP POLICY IF EXISTS library_items_select_member ON public.library_items;
CREATE POLICY library_items_select_member ON public.library_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.library_id = library_items.library_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = library_items.library_id AND l.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS library_items_write_operator_owner_only ON public.library_items;
CREATE POLICY library_items_write_operator_owner_only ON public.library_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = library_items.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = library_items.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- Cart items (member user owns rows)
DROP POLICY IF EXISTS cart_items_select_own ON public.cart_items;
CREATE POLICY cart_items_select_own ON public.cart_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cart_items_write_own ON public.cart_items;
CREATE POLICY cart_items_write_own ON public.cart_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Loan requests / loans (members own their requests; operator owner-only reviews)
DROP POLICY IF EXISTS loan_requests_select_member ON public.loan_requests;
CREATE POLICY loan_requests_select_member ON public.loan_requests
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS loan_requests_insert_member ON public.loan_requests;
CREATE POLICY loan_requests_insert_member ON public.loan_requests
  FOR INSERT TO authenticated
  WITH CHECK (member_user_id = auth.uid());

DROP POLICY IF EXISTS loan_requests_update_operator_owner_only ON public.loan_requests;
CREATE POLICY loan_requests_update_operator_owner_only ON public.loan_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = loan_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = loan_requests.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

DROP POLICY IF EXISTS loans_select_member ON public.loans;
CREATE POLICY loans_select_member ON public.loans
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS loans_write_own_member ON public.loans;
CREATE POLICY loans_write_own_member ON public.loans
  FOR ALL TO authenticated
  USING (member_user_id = auth.uid())
  WITH CHECK (member_user_id = auth.uid());

-- Waitlist entries
DROP POLICY IF EXISTS waitlist_entries_select_member ON public.waitlist_entries;
CREATE POLICY waitlist_entries_select_member ON public.waitlist_entries
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

DROP POLICY IF EXISTS waitlist_entries_write_member ON public.waitlist_entries;
CREATE POLICY waitlist_entries_write_member ON public.waitlist_entries
  FOR ALL TO authenticated
  USING (member_user_id = auth.uid())
  WITH CHECK (member_user_id = auth.uid());

-- Notifications
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- AI intake jobs (operator owner-only)
DROP POLICY IF EXISTS ai_intake_jobs_select_operator_owner_only ON public.ai_intake_jobs;
CREATE POLICY ai_intake_jobs_select_operator_owner_only ON public.ai_intake_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.libraries l
      WHERE l.id = ai_intake_jobs.library_id AND l.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- Stripe storage object policies (bucket prefix is {library_id}/...)
DROP POLICY IF EXISTS storage_toy_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_toy_images_insert ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_select ON storage.objects;
DROP POLICY IF EXISTS storage_return_images_insert ON storage.objects;

CREATE POLICY storage_toy_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'toy-images'
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND split_part(name, '/', 1) = m.library_id::text
    )
  );

CREATE POLICY storage_toy_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'toy-images'
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND split_part(name, '/', 1) = m.library_id::text
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

CREATE POLICY storage_return_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'return-images'
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND split_part(name, '/', 1) = m.library_id::text
    )
  );

CREATE POLICY storage_return_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'return-images'
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND split_part(name, '/', 1) = m.library_id::text
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'operator'
    )
  );

-- create_library RPC: creates libraries + an initial memberships row for the owner.
CREATE OR REPLACE FUNCTION public.create_library(p_library_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
BEGIN
  INSERT INTO public.libraries (owner_user_id, library_name)
  VALUES (auth.uid(), trim(p_library_name))
  RETURNING id INTO lid;

  INSERT INTO public.memberships (user_id, library_id)
  VALUES (auth.uid(), lid);

  RETURN lid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_library(text) TO authenticated;

COMMIT;

