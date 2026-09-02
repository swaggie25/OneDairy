
CREATE TABLE public.rate_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  animal_type text NOT NULL DEFAULT 'cow',
  min_fat numeric NOT NULL DEFAULT 0,
  max_fat numeric NOT NULL DEFAULT 99,
  min_snf numeric NOT NULL DEFAULT 0,
  max_snf numeric NOT NULL DEFAULT 99,
  rate_per_litre numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rate_slabs TO authenticated;
GRANT ALL ON public.rate_slabs TO service_role;
ALTER TABLE public.rate_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate slabs readable" ON public.rate_slabs FOR SELECT TO authenticated USING (true);
CREATE POLICY "rate slabs managed by owner" ON public.rate_slabs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner')) WITH CHECK (has_role(auth.uid(),'owner'));

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  punch_in_at timestamptz NOT NULL DEFAULT now(),
  punch_out_at timestamptz,
  punch_in_lat double precision,
  punch_in_lng double precision,
  punch_out_lat double precision,
  punch_out_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance readable" ON public.attendance FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'accountant')
     OR mcc_id IN (SELECT user_mcc_ids(auth.uid()))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));
CREATE POLICY "attendance written by agent or manager" ON public.attendance FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));

CREATE TABLE public.route_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  trip_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  session text NOT NULL DEFAULT 'morning',
  status text NOT NULL DEFAULT 'not_started',
  current_route_point_id uuid REFERENCES public.route_points(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER t_route_trips_touch BEFORE UPDATE ON public.route_trips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_trips TO authenticated;
GRANT ALL ON public.route_trips TO service_role;
ALTER TABLE public.route_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips readable" ON public.route_trips FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'accountant')
     OR mcc_id IN (SELECT user_mcc_ids(auth.uid()))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));
CREATE POLICY "trips written by agent or manager" ON public.route_trips FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));

CREATE TABLE public.milk_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_ref text UNIQUE,
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE RESTRICT,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  route_point_id uuid REFERENCES public.route_points(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES public.route_trips(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'agent',
  session text NOT NULL DEFAULT 'morning',
  animal_type text NOT NULL DEFAULT 'cow',
  quantity_litres numeric NOT NULL,
  fat_pct numeric,
  snf_pct numeric,
  clr numeric,
  temperature numeric,
  acidity numeric,
  water_adulteration_pct numeric,
  antibiotic_test_result text,
  water_adulteration_flag boolean NOT NULL DEFAULT false,
  rate_per_litre numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  risk_score numeric,
  status text NOT NULL DEFAULT 'pending',
  signature_url text,
  gps_lat double precision,
  gps_lng double precision,
  collected_at timestamptz NOT NULL DEFAULT now(),
  offline_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_collections_mcc_date ON public.milk_collections(mcc_id, collected_at DESC);
CREATE INDEX idx_collections_farmer ON public.milk_collections(farmer_id, collected_at DESC);
CREATE TRIGGER t_collections_touch BEFORE UPDATE ON public.milk_collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milk_collections TO authenticated;
GRANT ALL ON public.milk_collections TO service_role;
ALTER TABLE public.milk_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections readable" ON public.milk_collections FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'accountant')
     OR mcc_id IN (SELECT user_mcc_ids(auth.uid()))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid())
     OR farmer_id IN (SELECT f.id FROM public.farmers f WHERE f.profile_id = auth.uid()));
CREATE POLICY "collections written by staff" ON public.milk_collections FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));

CREATE TABLE public.quality_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.milk_collections(id) ON DELETE CASCADE,
  sample_id text NOT NULL,
  fat_pct numeric,
  snf_pct numeric,
  water_adulteration_pct numeric,
  temperature numeric,
  acidity numeric,
  antibiotic_test_result text,
  notes text,
  tested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tested_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_tests TO authenticated;
GRANT ALL ON public.quality_tests TO service_role;
ALTER TABLE public.quality_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality tests follow collection" ON public.quality_tests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.milk_collections c WHERE c.id = collection_id
     AND (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'accountant')
       OR c.mcc_id IN (SELECT user_mcc_ids(auth.uid()))
       OR c.agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.milk_collections c WHERE c.id = collection_id
     AND (has_role(auth.uid(),'owner')
       OR c.mcc_id IN (SELECT user_mcc_ids(auth.uid()))
       OR c.agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()))));

CREATE TABLE public.gps_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.route_trips(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  route_point_id uuid REFERENCES public.route_points(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'ping',
  lat double precision,
  lng double precision,
  accuracy numeric,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pings_trip ON public.gps_pings(trip_id, recorded_at DESC);
GRANT SELECT, INSERT ON public.gps_pings TO authenticated;
GRANT ALL ON public.gps_pings TO service_role;
ALTER TABLE public.gps_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pings readable" ON public.gps_pings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'owner') OR mcc_id IN (SELECT user_mcc_ids(auth.uid()))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));
CREATE POLICY "pings inserted by agent" ON public.gps_pings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'owner')
     OR (has_role(auth.uid(),'manager') AND mcc_id IN (SELECT user_mcc_ids(auth.uid())))
     OR agent_id IN (SELECT a.id FROM public.agents a WHERE a.profile_id = auth.uid()));

CREATE TABLE public.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_id uuid,
  metric text NOT NULL,
  horizon_date date NOT NULL,
  predicted_value numeric,
  confidence numeric,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.forecasts TO authenticated;
GRANT ALL ON public.forecasts TO service_role;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forecasts readable by staff" ON public.forecasts FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.route_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_pings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.milk_collections;
