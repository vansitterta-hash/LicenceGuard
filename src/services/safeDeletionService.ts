import { supabase } from '../lib/supabase';

import { assertSafeRecordRemoval, type DeletableRecord } from '../utils/safeDeletionPolicy';

export async function removeSafeRecord(table: DeletableRecord, id: string, dealerId: string): Promise<void> {
  if (!['application_cases', 'competencies', 'clients', 'firearms'].includes(table)) throw new Error('Record removal is unavailable.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Please sign in again before removing a record.');
  const [membership, record] = await Promise.all([
    supabase.from('dealer_users').select('role').eq('dealer_id', dealerId).eq('user_id', auth.user.id).eq('is_active', true).single(),
    supabase.from(table).select('*').eq('dealer_id', dealerId).eq('id', id).single(),
  ]);
  if (membership.error || !membership.data || record.error || !record.data || record.data.dealer_id !== dealerId) {
    throw new Error('This record is unavailable or you do not have access to remove it.');
  }
  assertSafeRecordRemoval(table, record.data, membership.data.role);
  const { data, error } = await supabase.rpc('remove_safe_beta_record', {
    p_table: table, p_id: id, p_dealer_id: dealerId,
  });
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Safe record removal is not available yet. Please contact your administrator.' : error.message);
  if (data !== true) throw new Error('The record was not removed. It may be protected or you may no longer have access.');
}
