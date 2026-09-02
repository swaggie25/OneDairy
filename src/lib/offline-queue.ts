import { supabase } from "@/integrations/supabase/client";

/**
 * Offline-first queue for agent milk entries. Entries are written to
 * localStorage immediately and flushed to the backend whenever connectivity
 * returns. `client_ref` makes every push idempotent.
 *
 * Flushing calls the `record_milk_collection` RPC rather than inserting into
 * `milk_collections` directly — that function independently re-verifies the
 * agent, farmer, assigned stop, GPS accuracy and collection geofence on the
 * server, so a compromised or modified client can never bypass verification
 * (see PART 1 §9 — geofence enforcement must live in the backend, not just
 * the UI).
 */

const KEY = "dairyone.collection-queue.v1";

export type QueuedCollection = {
  client_ref: string;
  farmer_id: string;
  agent_id: string | null;
  mcc_id: string;
  route_point_id: string | null;
  trip_id: string | null;
  source: string;
  session: string;
  animal_type: string;
  quantity_litres: number;
  fat_pct: number | null;
  snf_pct: number | null;
  clr: number | null;
  temperature: number | null;
  acidity: number | null;
  water_adulteration_pct: number | null;
  antibiotic_test_result: string | null;
  water_adulteration_flag: boolean;
  rate_per_litre: number;
  total_amount: number;
  risk_score: number | null;
  status: string;
  quality_override_reason: string | null;
  signature_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  collected_at: string;
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function read(): QueuedCollection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedCollection[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedCollection[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items.length));
}

export function queueSize(): number {
  return read().length;
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(read().length);
  return () => listeners.delete(listener);
}

export function enqueue(entry: QueuedCollection) {
  write([...read(), entry]);
}

let flushing = false;

export type FlushResult = { synced: number; errors: string[] };

/**
 * Pushes queued entries via the `record_milk_collection` RPC (server-side
 * geofence/accuracy/permission verification — see module docstring above).
 * Safe to call repeatedly. Entries that fail verification stay queued (never
 * silently dropped) and their message is surfaced in `errors` so the UI can
 * tell the agent why a sync is stuck, e.g. still too far from the stop.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { synced: 0, errors: [] };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, errors: [] };
  flushing = true;
  let synced = 0;
  const errors: string[] = [];
  try {
    const items = read();
    const remaining: QueuedCollection[] = [];
    for (const item of items) {
      const { error } = await supabase.rpc("record_milk_collection", {
        p_client_ref: item.client_ref,
        p_farmer_id: item.farmer_id,
        p_mcc_id: item.mcc_id,
        p_route_point_id: item.route_point_id,
        p_trip_id: item.trip_id,
        p_source: item.source,
        p_session: item.session,
        p_animal_type: item.animal_type,
        p_quantity_litres: item.quantity_litres,
        p_fat_pct: item.fat_pct,
        p_snf_pct: item.snf_pct,
        p_clr: item.clr,
        p_temperature: item.temperature,
        p_acidity: item.acidity,
        p_water_adulteration_pct: item.water_adulteration_pct,
        p_antibiotic_test_result: item.antibiotic_test_result,
        p_water_adulteration_flag: item.water_adulteration_flag,
        p_rate_per_litre: item.rate_per_litre,
        p_total_amount: item.total_amount,
        p_risk_score: item.risk_score,
        p_quality_override_reason: item.quality_override_reason,
        p_signature_url: item.signature_url,
        p_gps_lat: item.gps_lat,
        p_gps_lng: item.gps_lng,
        p_gps_accuracy: item.gps_accuracy,
        p_collected_at: item.collected_at,
      });
      if (error) {
        // Duplicate means it already landed; anything else stays queued so
        // nothing is ever silently lost.
        if (error.code === "23505") continue;
        remaining.push(item);
        errors.push(error.message);
      } else {
        synced += 1;
      }
    }
    write(remaining);
  } finally {
    flushing = false;
  }
  return { synced, errors };
}

export function newClientRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}