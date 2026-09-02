
-- ROLES ---------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('owner','manager','agent','buyer','farmer','accountant');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE,
  full_name text,
  preferred_language text NOT NULL DEFAULT 'en',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mcc_centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  village text,
  district text,
  state text,
  lat double precision,
  lng double precision,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcc_centres TO authenticated;
GRANT ALL ON public.mcc_centres TO service_role;
ALTER TABLE public.mcc_centres ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  mcc_id uuid REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, mcc_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.user_mcc_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mcc_id FROM public.user_roles WHERE user_id = _user_id AND mcc_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
                 AND role IN ('owner','manager','accountant'))
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by self and staff" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "centres readable" ON public.mcc_centres FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
         OR id IN (SELECT public.user_mcc_ids(auth.uid())));
CREATE POLICY "centres managed by owner" ON public.mcc_centres FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- STAFF & FARMERS -----------------------------------------------------
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  employee_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents readable" ON public.agents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
         OR mcc_id IN (SELECT public.user_mcc_ids(auth.uid())) OR profile_id = auth.uid());
CREATE POLICY "agents managed" ON public.agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))));

CREATE TABLE public.farmers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  farmer_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  village text,
  bank_account text,
  ifsc text,
  upi_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farmers TO authenticated;
GRANT ALL ON public.farmers TO service_role;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "farmers readable" ON public.farmers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
         OR mcc_id IN (SELECT public.user_mcc_ids(auth.uid())) OR profile_id = auth.uid());
CREATE POLICY "farmers managed" ON public.farmers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))));

CREATE TABLE public.farmer_animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  animal_type text NOT NULL,
  animal_count integer NOT NULL DEFAULT 1,
  health_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farmer_animals TO authenticated;
GRANT ALL ON public.farmer_animals TO service_role;
ALTER TABLE public.farmer_animals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "animals follow farmer" ON public.farmer_animals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = farmer_id AND
     (public.has_role(auth.uid(),'owner') OR f.mcc_id IN (SELECT public.user_mcc_ids(auth.uid())) OR f.profile_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = farmer_id AND
     (public.has_role(auth.uid(),'owner') OR f.mcc_id IN (SELECT public.user_mcc_ids(auth.uid())))));

-- ROUTES --------------------------------------------------------------
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  assigned_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes readable" ON public.routes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
         OR mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))
         OR assigned_agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));
CREATE POLICY "routes managed" ON public.routes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR (public.has_role(auth.uid(),'manager') AND mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))));

CREATE TABLE public.route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sequence integer NOT NULL DEFAULT 1,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_points TO authenticated;
GRANT ALL ON public.route_points TO service_role;
ALTER TABLE public.route_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route points follow route" ON public.route_points FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND
     (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
      OR r.mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))
      OR r.assigned_agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND
     (public.has_role(auth.uid(),'owner') OR r.mcc_id IN (SELECT public.user_mcc_ids(auth.uid())))));

CREATE TABLE public.route_point_farmers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_point_id uuid NOT NULL REFERENCES public.route_points(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  UNIQUE (route_point_id, farmer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_point_farmers TO authenticated;
GRANT ALL ON public.route_point_farmers TO service_role;
ALTER TABLE public.route_point_farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route point farmers follow point" ON public.route_point_farmers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.route_points rp JOIN public.routes r ON r.id = rp.route_id
     WHERE rp.id = route_point_id AND (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'accountant')
      OR r.mcc_id IN (SELECT public.user_mcc_ids(auth.uid()))
      OR r.assigned_agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.route_points rp JOIN public.routes r ON r.id = rp.route_id
     WHERE rp.id = route_point_id AND (public.has_role(auth.uid(),'owner') OR r.mcc_id IN (SELECT public.user_mcc_ids(auth.uid())))));

-- OTP (server only) ---------------------------------------------------
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  role public.app_role,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON public.otp_codes (phone, created_at DESC);
GRANT ALL ON public.otp_codes TO service_role;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- updated_at trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER t_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_centres_touch BEFORE UPDATE ON public.mcc_centres FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_agents_touch BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_farmers_touch BEFORE UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_routes_touch BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
