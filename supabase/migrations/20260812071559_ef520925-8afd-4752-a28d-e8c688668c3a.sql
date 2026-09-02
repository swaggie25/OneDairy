CREATE TABLE public.settlement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_litres numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  farmer_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_runs TO authenticated;
GRANT ALL ON public.settlement_runs TO service_role;
ALTER TABLE public.settlement_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settlement_runs_staff_all" ON public.settlement_runs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER t_settlement_runs_touch BEFORE UPDATE ON public.settlement_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_run_id uuid REFERENCES public.settlement_runs(id) ON DELETE CASCADE,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  quantity_litres numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'upi',
  status text NOT NULL DEFAULT 'pending',
  reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_farmer ON public.payments(farmer_id);
CREATE INDEX idx_payments_run ON public.payments(settlement_run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_staff_all" ON public.payments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "payments_farmer_read_own" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = payments.farmer_id AND f.profile_id = auth.uid()));
CREATE TRIGGER t_payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  account text NOT NULL,
  direction text NOT NULL,
  amount numeric NOT NULL,
  ref_type text,
  ref_id uuid,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_mcc_date ON public.ledger_entries(mcc_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_staff_all" ON public.ledger_entries FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.quality_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES public.milk_collections(id) ON DELETE CASCADE,
  mcc_id uuid NOT NULL REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  farmer_id uuid REFERENCES public.farmers(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quality_alerts_mcc ON public.quality_alerts(mcc_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_alerts TO authenticated;
GRANT ALL ON public.quality_alerts TO service_role;
ALTER TABLE public.quality_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quality_alerts_staff_all" ON public.quality_alerts FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER t_quality_alerts_touch BEFORE UPDATE ON public.quality_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcc_id uuid REFERENCES public.mcc_centres(id) ON DELETE CASCADE,
  farmer_id uuid REFERENCES public.farmers(id) ON DELETE CASCADE,
  raised_by uuid REFERENCES auth.users(id),
  subject text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open',
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complaints_staff_all" ON public.complaints FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "complaints_owner_read" ON public.complaints FOR SELECT TO authenticated
  USING (raised_by = auth.uid() OR EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = complaints.farmer_id AND f.profile_id = auth.uid()));
CREATE POLICY "complaints_owner_insert" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (raised_by = auth.uid());
CREATE TRIGGER t_complaints_touch BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();