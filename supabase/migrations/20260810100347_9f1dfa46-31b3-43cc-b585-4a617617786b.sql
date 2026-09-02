
CREATE TABLE public.buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  contact_person text,
  phone text,
  city text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyers TO authenticated;
GRANT ALL ON public.buyers TO service_role;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buyers_read_auth" ON public.buyers FOR SELECT TO authenticated USING (true);
CREATE POLICY "buyers_write_staff" ON public.buyers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER t_buyers_touch BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  transfer_date date NOT NULL DEFAULT (now()::date),
  session text NOT NULL DEFAULT 'morning',
  quantity_litres numeric NOT NULL DEFAULT 0,
  avg_fat numeric,
  avg_snf numeric,
  vehicle_no text,
  tanker_id text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  dispatched_at timestamptz,
  received_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_staff_all" ON public.transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR mcc_id IN (SELECT public.user_mcc_ids(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR mcc_id IN (SELECT public.user_mcc_ids(auth.uid())));
CREATE POLICY "transfers_buyer_read" ON public.transfers FOR SELECT TO authenticated
  USING (buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = auth.uid()));
CREATE POLICY "transfers_buyer_update" ON public.transfers FOR UPDATE TO authenticated
  USING (buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = auth.uid()))
  WITH CHECK (buyer_id IN (SELECT id FROM public.buyers WHERE profile_id = auth.uid()));
CREATE TRIGGER t_transfers_touch BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.transfer_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.milk_collections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_collections TO authenticated;
GRANT ALL ON public.transfer_collections TO service_role;
ALTER TABLE public.transfer_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfer_collections_scoped" ON public.transfer_collections FOR ALL TO authenticated
  USING (transfer_id IN (SELECT id FROM public.transfers))
  WITH CHECK (transfer_id IN (SELECT id FROM public.transfers));

CREATE TABLE public.qr_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('farmer','agent')),
  entity_id uuid NOT NULL,
  mcc_id uuid REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  code_value text NOT NULL UNIQUE,
  card_type text NOT NULL DEFAULT 'digital',
  active boolean NOT NULL DEFAULT true,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_cards TO authenticated;
GRANT ALL ON public.qr_cards TO service_role;
ALTER TABLE public.qr_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_cards_read_auth" ON public.qr_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "qr_cards_write_staff" ON public.qr_cards FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.buyers (name, code, contact_person, phone, city)
VALUES ('Amul Dairy Plant', 'BUY-AMUL', 'Plant Desk', '9800000001', 'Anand'),
       ('Sarvottam Dairy', 'BUY-SARV', 'Intake Office', '9800000002', 'Nadiad');

INSERT INTO public.qr_cards (entity_type, entity_id, mcc_id, code_value)
SELECT 'farmer', f.id, f.mcc_id, 'DO-F-' || f.farmer_code FROM public.farmers f
ON CONFLICT DO NOTHING;
INSERT INTO public.qr_cards (entity_type, entity_id, mcc_id, code_value)
SELECT 'agent', a.id, a.mcc_id, 'DO-A-' || a.employee_code FROM public.agents a
ON CONFLICT DO NOTHING;
