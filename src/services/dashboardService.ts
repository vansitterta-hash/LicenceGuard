import { supabase } from '../lib/supabase';
import { CLOSED_APPLICATION_CASE_STATUSES } from '../types/applicationCase';

export async function getDashboardCounts(dealerId: string, now = new Date()): Promise<number[]> {
  const day = (offset: number) => { const date = new Date(now); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const related = (table: string) => supabase.from(table).select('id, clients!inner(id)', { count: 'exact', head: true })
    .eq('dealer_id', dealerId).eq('clients.dealer_id', dealerId).eq('clients.is_active', true);
  const results = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId).eq('is_active', true),
    related('application_cases').not('status', 'in', `(${CLOSED_APPLICATION_CASE_STATUSES.join(',')})`),
    related('firearm_licences').gte('expiry_date', day(0)).lte('expiry_date', day(120)),
    related('competencies').gte('expiry_date', day(0)).lte('expiry_date', day(120)),
    related('firearm_licences').lte('expiry_date', day(30)),
    related('competencies').lte('expiry_date', day(30)),
  ]);
  for (const result of results) if (result.error) throw new Error(result.error.message);
  const counts = results.map((result) => result.count ?? 0);
  return [counts[0], counts[2] + counts[3], counts[1], counts[4] + counts[5]];
}
