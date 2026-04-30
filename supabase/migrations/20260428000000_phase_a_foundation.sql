-- ShareParty Phase A: profiles, libraries, memberships, children, RLS, RPCs

-- Enums
CREATE TYPE public.library_role AS ENUM ('OPERATOR', 'MEMBER');
CREATE TYPE public.billing_mode AS ENUM ('PLATFORM_CONNECT', 'LIBRARY_BYO_STRIPE');

-- Profiles (1:1 with auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  date_of_birth date,
  locale text NOT NULL DEFAULT 'en-NZ',
  currency text NOT NULL DEFAULT 'NZD',
  coppa_parental_consent_us boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  billing_mode public.billing_mode NOT NULL DEFAULT 'PLATFORM_CONNECT',
  stripe_connect_account_id text,
  stripe_byo_secret_ciphertext text,
  stripe_byo_publishable_key text,
  stripe_byo_webhook_secret_ciphertext text,
  onboarding_completed_at timestamptz,
  dpa_acknowledged_at timestamptz,
  coppa_operator_acknowledged_at timestamptz,
  default_locale text NOT NULL DEFAULT 'en-NZ',
  default_currency text NOT NULL DEFAULT 'NZD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libraries_slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
);

CREATE TABLE public.library_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  library_id uuid NOT NULL REFERENCES public.libraries (id) ON DELETE CASCADE,
  role public.library_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, library_id)
);

CREATE INDEX library_memberships_library_id_idx ON public.library_memberships (library_id);
CREATE INDEX library_memberships_user_id_idx ON public.library_memberships (user_id);

-- Minimal child record (COPPA-oriented): tied to parent auth user + library context
CREATE TABLE public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.libraries (id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  age integer NOT NULL CHECK (age >= 0 AND age <= 17),
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX children_library_parent_idx ON public.children (library_id, parent_user_id);

-- Auto-create profile on signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Normalise slug: lowercase, replace invalid chars with hyphen
CREATE OR REPLACE FUNCTION public.normalise_library_slug(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from lower(regexp_replace(raw, '[^a-zA-Z0-9-]+', '-', 'g')));
$$;

-- Create library and operator membership in one transaction
CREATE OR REPLACE FUNCTION public.create_library(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
  ns text;
BEGIN
  ns := public.normalise_library_slug(p_slug);
  IF ns IS NULL OR length(ns) < 2 THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  INSERT INTO public.libraries (name, slug, billing_mode)
  VALUES (trim(p_name), ns, 'PLATFORM_CONNECT')
  RETURNING id INTO lid;

  INSERT INTO public.library_memberships (user_id, library_id, role)
  VALUES (auth.uid(), lid, 'OPERATOR');

  RETURN lid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_library(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER libraries_updated_at BEFORE UPDATE ON public.libraries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER children_updated_at BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Profiles: own row only
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Libraries: visible if member of library
CREATE POLICY libraries_select_member ON public.libraries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.library_memberships m
      WHERE m.library_id = libraries.id AND m.user_id = auth.uid()
    )
  );

-- Operators can update their libraries (settings, Stripe fields via app)
CREATE POLICY libraries_update_operator ON public.libraries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.library_memberships m
      WHERE m.library_id = libraries.id AND m.user_id = auth.uid() AND m.role = 'OPERATOR'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.library_memberships m
      WHERE m.library_id = libraries.id AND m.user_id = auth.uid() AND m.role = 'OPERATOR'
    )
  );

-- Memberships: any row for a library the user belongs to
CREATE POLICY memberships_select_library ON public.library_memberships FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.library_memberships mine
      WHERE mine.library_id = library_memberships.library_id AND mine.user_id = auth.uid()
    )
  );

-- Children: parent owns their rows; operators can read for support (Phase A: parent CRUD only)
CREATE POLICY children_select_parent ON public.children FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

CREATE POLICY children_insert_parent ON public.children FOR INSERT TO authenticated
  WITH CHECK (
    parent_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.library_memberships m
      WHERE m.library_id = children.library_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY children_update_parent ON public.children FOR UPDATE TO authenticated
  USING (parent_user_id = auth.uid()) WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY children_delete_parent ON public.children FOR DELETE TO authenticated
  USING (parent_user_id = auth.uid());

-- Storage buckets (Phase B uses toy-images; Phase A seeds policies placeholder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('toy-images', 'toy-images', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('return-images', 'return-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users with library membership can upload under library prefix
-- Path convention: {library_id}/...
CREATE POLICY storage_toy_images_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'toy-images' AND EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.user_id = auth.uid()
      AND split_part(name, '/', 1) = m.library_id::text
  ));

CREATE POLICY storage_toy_images_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'toy-images' AND EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.user_id = auth.uid() AND m.role = 'OPERATOR'
      AND split_part(name, '/', 1) = m.library_id::text
  ));

CREATE POLICY storage_return_images_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'return-images' AND EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.user_id = auth.uid()
      AND split_part(name, '/', 1) = m.library_id::text
  ));

CREATE POLICY storage_return_images_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'return-images' AND EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.user_id = auth.uid()
      AND split_part(name, '/', 1) = m.library_id::text
  ));
