import { supabase } from '../lib/supabase';
import type {
  ClientFormValues,
  ClientProfileSummary,
  ClientRecord,
} from '../types/client';

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildClientPayload(
  dealerId: string,
  userId: string,
  values: ClientFormValues
) {
  return {
    dealer_id: dealerId,
    first_name: values.firstName.trim(),
    surname: values.surname.trim(),
    id_number: values.idNumber.trim(),

    cellphone: emptyToNull(values.cellphone),
    alternate_cellphone: emptyToNull(values.alternateCellphone),

    email: emptyToNull(values.email)?.toLowerCase() ?? null,

    preferred_contact_channel: values.preferredContactChannel,

    address_line_1: emptyToNull(values.addressLine1),
    address_line_2: emptyToNull(values.addressLine2),

    suburb: emptyToNull(values.suburb),
    city: emptyToNull(values.city),
    province: emptyToNull(values.province),
    postal_code: emptyToNull(values.postalCode),

    notes: emptyToNull(values.notes),

    updated_by: userId,
  };
}

export async function listClients(
  dealerId: string,
  searchTerm = ''
): Promise<ClientRecord[]> {
  let query = supabase
    .from('clients')
    .select('*')
    .eq('dealer_id', dealerId)
    .eq('is_active', true)
    .order('surname', { ascending: true })
    .order('first_name', { ascending: true });

  const cleanedSearch = searchTerm.trim();

  if (cleanedSearch) {
    const escapedSearch = cleanedSearch.replace(/[%_]/g, '');

    query = query.or(
      [
        `first_name.ilike.%${escapedSearch}%`,
        `surname.ilike.%${escapedSearch}%`,
        `id_number.ilike.%${escapedSearch}%`,
        `cellphone.ilike.%${escapedSearch}%`,
        `email.ilike.%${escapedSearch}%`,
      ].join(',')
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ClientRecord[];
}

export async function getClient(clientId: string): Promise<ClientRecord> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ClientRecord;
}

export async function getClientProfileSummary(
  clientId: string
): Promise<ClientProfileSummary> {
  const client = await getClient(clientId);

  const [
    competenciesResult,
    firearmsResult,
    licencesResult,
    renewalsResult,
  ] = await Promise.all([
    supabase
      .from('competencies')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId),

    supabase
      .from('firearms')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true),

    supabase
      .from('firearm_licences')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId),

    supabase
      .from('renewal_cases')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .not('status', 'in', '("APPROVED","DECLINED","CLOSED")'),
  ]);

  const firstError =
    competenciesResult.error ??
    firearmsResult.error ??
    licencesResult.error ??
    renewalsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    ...client,

    competencies_count: competenciesResult.count ?? 0,
    firearms_count: firearmsResult.count ?? 0,
    licences_count: licencesResult.count ?? 0,
    renewals_count: renewalsResult.count ?? 0,
  };
}

export async function createClient(
  dealerId: string,
  userId: string,
  values: ClientFormValues
): Promise<ClientRecord> {
  const payload = {
    ...buildClientPayload(dealerId, userId, values),
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('clients')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        'A client with this ID number already exists for this dealer.'
      );
    }

    throw new Error(error.message);
  }

  return data as ClientRecord;
}

export async function updateClient(
  clientId: string,
  dealerId: string,
  userId: string,
  values: ClientFormValues
): Promise<ClientRecord> {
  const { data, error } = await supabase
    .from('clients')
    .update(buildClientPayload(dealerId, userId, values))
    .eq('id', clientId)
    .eq('dealer_id', dealerId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        'A client with this ID number already exists for this dealer.'
      );
    }

    throw new Error(error.message);
  }

  return data as ClientRecord;
}

export async function archiveClient(
  clientId: string,
  dealerId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      is_active: false,
      updated_by: userId,
    })
    .eq('id', clientId)
    .eq('dealer_id', dealerId);

  if (error) {
    throw new Error(error.message);
  }
}