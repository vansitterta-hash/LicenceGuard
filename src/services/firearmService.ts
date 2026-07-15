import { supabase } from '../lib/supabase';
import type {
  FirearmFormValues,
  FirearmLicenceRecord,
  FirearmListItem,
  FirearmRecord,
  FirearmType,
  LicenceStatus,
} from '../types/firearm';

const DAY_IN_MILLISECONDS = 86_400_000;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function calculateDaysUntil(dateValue: string): number {
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const targetUtc = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  return Math.ceil(
    (targetUtc - todayUtc) / DAY_IN_MILLISECONDS
  );
}

function getLicenceHealth(
  licence: FirearmLicenceRecord | null
): FirearmListItem['licenceHealth'] {
  if (!licence) {
    return 'NO_LICENCE';
  }

  const days = calculateDaysUntil(licence.expiry_date);

  if (days < 0 || licence.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  if (days <= 90) {
    return 'URGENT';
  }

  if (days <= 120) {
    return 'RENEWAL_DUE';
  }

  if (days <= 180) {
    return 'APPROACHING';
  }

  return 'VALID';
}

function mapFirearm(
  firearm: FirearmRecord,
  licence: FirearmLicenceRecord | null
): FirearmListItem {
  return {
    ...firearm,
    licence,
    daysUntilExpiry: licence
      ? calculateDaysUntil(licence.expiry_date)
      : null,
    licenceHealth: getLicenceHealth(licence),
  };
}

export async function listClientFirearms(
  clientId: string
): Promise<FirearmListItem[]> {
  const [firearmsResult, licencesResult] = await Promise.all([
    supabase
      .from('firearms')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('make', { ascending: true })
      .order('model', { ascending: true }),

    supabase
      .from('firearm_licences')
      .select('*')
      .eq('client_id', clientId)
      .order('expiry_date', { ascending: false }),
  ]);

  const firstError =
    firearmsResult.error ?? licencesResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const firearms =
    (firearmsResult.data ?? []) as FirearmRecord[];

  const licences =
    (licencesResult.data ?? []) as FirearmLicenceRecord[];

  const latestLicenceByFirearmId = new Map<
    string,
    FirearmLicenceRecord
  >();

  licences.forEach((licence) => {
    if (!latestLicenceByFirearmId.has(licence.firearm_id)) {
      latestLicenceByFirearmId.set(
        licence.firearm_id,
        licence
      );
    }
  });

  return firearms.map((firearm) =>
    mapFirearm(
      firearm,
      latestLicenceByFirearmId.get(firearm.id) ?? null
    )
  );
}

export async function getFirearm(
  firearmId: string
): Promise<FirearmListItem> {
  const [firearmResult, licenceResult] = await Promise.all([
    supabase
      .from('firearms')
      .select('*')
      .eq('id', firearmId)
      .single(),

    supabase
      .from('firearm_licences')
      .select('*')
      .eq('firearm_id', firearmId)
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError =
    firearmResult.error ?? licenceResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return mapFirearm(
    firearmResult.data as FirearmRecord,
    (licenceResult.data as FirearmLicenceRecord | null) ??
      null
  );
}

function hasLicenceValues(
  values: FirearmFormValues
): boolean {
  return Boolean(
    values.licenceNumber.trim() ||
      values.licenceSection.trim() ||
      values.licenceIssueDate.trim() ||
      values.licenceExpiryDate.trim() ||
      values.licenceNotes.trim()
  );
}

function buildFirearmPayload(
  dealerId: string,
  clientId: string,
  userId: string,
  values: FirearmFormValues
) {
  return {
    dealer_id: dealerId,
    client_id: clientId,
    make: values.make.trim(),
    model: emptyToNull(values.model),
    calibre: values.calibre.trim(),
    serial_number: values.serialNumber.trim(),
    firearm_type: values.firearmType,
    required_competency: values.requiredCompetency,
    competency_override_reason: emptyToNull(
      values.competencyOverrideReason
    ),
    notes: emptyToNull(values.firearmNotes),
    updated_by: userId,
  };
}

function buildLicencePayload(
  dealerId: string,
  clientId: string,
  firearmId: string,
  userId: string,
  values: FirearmFormValues
) {
  return {
    dealer_id: dealerId,
    client_id: clientId,
    firearm_id: firearmId,
    licence_number: emptyToNull(values.licenceNumber),
    licence_section: emptyToNull(values.licenceSection),
    issue_date: emptyToNull(values.licenceIssueDate),
    expiry_date: values.licenceExpiryDate.trim(),
    status: values.licenceStatus,
    notes: emptyToNull(values.licenceNotes),
    updated_by: userId,
  };
}

export async function createFirearm(
  dealerId: string,
  clientId: string,
  userId: string,
  values: FirearmFormValues
): Promise<FirearmListItem> {
  const { data: firearmData, error: firearmError } =
    await supabase
      .from('firearms')
      .insert({
        ...buildFirearmPayload(
          dealerId,
          clientId,
          userId,
          values
        ),
        created_by: userId,
      })
      .select('*')
      .single();

  if (firearmError) {
    if (firearmError.code === '23505') {
      throw new Error(
        'A firearm with this serial number already exists for this dealer.'
      );
    }

    throw new Error(firearmError.message);
  }

  const firearm = firearmData as FirearmRecord;
  let licence: FirearmLicenceRecord | null = null;

  if (hasLicenceValues(values)) {
    const { data: licenceData, error: licenceError } =
      await supabase
        .from('firearm_licences')
        .insert({
          ...buildLicencePayload(
            dealerId,
            clientId,
            firearm.id,
            userId,
            values
          ),
          created_by: userId,
        })
        .select('*')
        .single();

    if (licenceError) {
      await supabase
        .from('firearms')
        .delete()
        .eq('id', firearm.id)
        .eq('dealer_id', dealerId);

      throw new Error(licenceError.message);
    }

    licence = licenceData as FirearmLicenceRecord;
  }

  return mapFirearm(firearm, licence);
}

export async function updateFirearm(
  firearmId: string,
  dealerId: string,
  clientId: string,
  userId: string,
  values: FirearmFormValues
): Promise<FirearmListItem> {
  const existing = await getFirearm(firearmId);

  const { data: firearmData, error: firearmError } =
    await supabase
      .from('firearms')
      .update(
        buildFirearmPayload(
          dealerId,
          clientId,
          userId,
          values
        )
      )
      .eq('id', firearmId)
      .eq('dealer_id', dealerId)
      .select('*')
      .single();

  if (firearmError) {
    if (firearmError.code === '23505') {
      throw new Error(
        'A firearm with this serial number already exists for this dealer.'
      );
    }

    throw new Error(firearmError.message);
  }

  let licence: FirearmLicenceRecord | null =
    existing.licence;

  if (hasLicenceValues(values)) {
    if (!values.licenceExpiryDate.trim()) {
      throw new Error(
        'Enter a licence expiry date before saving licence information.'
      );
    }

    if (existing.licence) {
      const { data, error } = await supabase
        .from('firearm_licences')
        .update(
          buildLicencePayload(
            dealerId,
            clientId,
            firearmId,
            userId,
            values
          )
        )
        .eq('id', existing.licence.id)
        .eq('dealer_id', dealerId)
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      licence = data as FirearmLicenceRecord;
    } else {
      const { data, error } = await supabase
        .from('firearm_licences')
        .insert({
          ...buildLicencePayload(
            dealerId,
            clientId,
            firearmId,
            userId,
            values
          ),
          created_by: userId,
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      licence = data as FirearmLicenceRecord;
    }
  }

  return mapFirearm(
    firearmData as FirearmRecord,
    licence
  );
}

export async function archiveFirearm(
  firearmId: string,
  dealerId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('firearms')
    .update({
      is_active: false,
      updated_by: userId,
    })
    .eq('id', firearmId)
    .eq('dealer_id', dealerId);

  if (error) {
    throw new Error(error.message);
  }
}

export function getFirearmTypeLabel(
  firearmType: FirearmType
): string {
  return firearmType
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

export function getLicenceStatusLabel(
  status: LicenceStatus
): string {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}
