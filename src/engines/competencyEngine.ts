import { supabase } from '../lib/supabase';
import type {
  CompetencyCategory,
  CompetencyFormValues,
  CompetencyListItem,
  CompetencyRecord,
  CompetencyStatus,
} from '../types/competency';

const DAY_IN_MILLISECONDS = 86_400_000;

export type CompetencyHealth =
  | 'VALID'
  | 'RENEWAL_DUE'
  | 'URGENT'
  | 'EXPIRED'
  | 'INCOMPLETE';

export type CompetencyCategorySummary = {
  category: CompetencyCategory;
  label: string;
  exists: boolean;
  record: CompetencyListItem | null;
  health: CompetencyHealth;
  nextAction: string;
};

export type ClientCompetencySummary = {
  clientId: string;
  records: CompetencyListItem[];
  categories: CompetencyCategorySummary[];
  totalRecorded: number;
  validCount: number;
  actionRequiredCount: number;
  missingCount: number;
};

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  HANDGUN: 'Handgun',
  RIFLE: 'Manually operated rifle or carbine',
  SHOTGUN: 'Shotgun',
  SLR: 'Self-loading rifle or carbine',
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normaliseDate(value: string): string | null {
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

export function getCompetencyStatus(
  expiryDate: string | null
): CompetencyStatus {
  if (!expiryDate) {
    return 'NO_EXPIRY_RECORDED';
  }

  const daysUntilExpiry = calculateDaysUntil(expiryDate);

  if (daysUntilExpiry < 0) {
    return 'EXPIRED';
  }

  if (daysUntilExpiry <= 120) {
    return 'EXPIRING';
  }

  return 'VALID';
}

export function getCompetencyHealth(
  competency: CompetencyListItem | null
): CompetencyHealth {
  if (!competency) {
    return 'INCOMPLETE';
  }

  if (
    !competency.certificate_number ||
    !competency.issue_date ||
    !competency.expiry_date
  ) {
    return 'INCOMPLETE';
  }

  if (
    competency.status === 'EXPIRED' ||
    (competency.daysUntilExpiry !== null &&
      competency.daysUntilExpiry < 0)
  ) {
    return 'EXPIRED';
  }

  if (
    competency.daysUntilExpiry !== null &&
    competency.daysUntilExpiry <= 90
  ) {
    return 'URGENT';
  }

  if (
    competency.daysUntilExpiry !== null &&
    competency.daysUntilExpiry <= 120
  ) {
    return 'RENEWAL_DUE';
  }

  return 'VALID';
}

export function getCompetencyNextAction(
  competency: CompetencyListItem | null
): string {
  const health = getCompetencyHealth(competency);

  switch (health) {
    case 'INCOMPLETE':
      return competency
        ? 'Complete the missing competency information.'
        : 'Capture this competency category.';

    case 'EXPIRED':
      return 'Prepare and submit a competency renewal application.';

    case 'URGENT':
      return 'Begin the competency renewal process immediately.';

    case 'RENEWAL_DUE':
      return 'Open a competency renewal case and prepare the documents.';

    case 'VALID':
      return 'No immediate competency action required.';
  }
}

export function mapCompetencyRecord(
  record: CompetencyRecord
): CompetencyListItem {
  const daysUntilExpiry = record.expiry_date
    ? calculateDaysUntil(record.expiry_date)
    : null;

  return {
    ...record,
    daysUntilExpiry,
    status: getCompetencyStatus(record.expiry_date),
  };
}

export function getCompetencyCategoryLabel(
  category: CompetencyCategory
): string {
  return CATEGORY_LABELS[category];
}

export async function listClientCompetencies(
  clientId: string
): Promise<CompetencyListItem[]> {
  const { data, error } = await supabase
    .from('competencies')
    .select('*')
    .eq('client_id', clientId)
    .order('category', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CompetencyRecord[]).map(
    mapCompetencyRecord
  );
}

export async function getCompetency(
  competencyId: string
): Promise<CompetencyListItem> {
  const { data, error } = await supabase
    .from('competencies')
    .select('*')
    .eq('id', competencyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCompetencyRecord(data as CompetencyRecord);
}

export async function getClientCompetencySummary(
  clientId: string
): Promise<ClientCompetencySummary> {
  const records = await listClientCompetencies(clientId);

  const recordByCategory = new Map(
    records.map((record) => [record.category, record])
  );

  const categories = (
    Object.keys(CATEGORY_LABELS) as CompetencyCategory[]
  ).map((category) => {
    const record = recordByCategory.get(category) ?? null;

    return {
      category,
      label: CATEGORY_LABELS[category],
      exists: Boolean(record),
      record,
      health: getCompetencyHealth(record),
      nextAction: getCompetencyNextAction(record),
    };
  });

  return {
    clientId,
    records,
    categories,
    totalRecorded: records.length,
    validCount: categories.filter(
      (item) => item.health === 'VALID'
    ).length,
    actionRequiredCount: categories.filter((item) =>
      ['RENEWAL_DUE', 'URGENT', 'EXPIRED'].includes(item.health)
    ).length,
    missingCount: categories.filter(
      (item) => !item.exists
    ).length,
  };
}

export async function createCompetency(
  dealerId: string,
  clientId: string,
  userId: string,
  values: CompetencyFormValues
): Promise<CompetencyListItem> {
  const { data: existing, error: existingError } =
    await supabase
      .from('competencies')
      .select('id')
      .eq('client_id', clientId)
      .eq('category', values.category)
      .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    throw new Error(
      `This client already has a ${getCompetencyCategoryLabel(
        values.category
      )} competency record. Edit the existing record instead.`
    );
  }

  const payload = {
    dealer_id: dealerId,
    client_id: clientId,
    category: values.category,
    certificate_number: emptyToNull(values.certificateNumber),
    issue_date: normaliseDate(values.issueDate),
    expiry_date: normaliseDate(values.expiryDate),
    notes: emptyToNull(values.notes),
    verified: values.verified,
    verified_at: values.verified
      ? new Date().toISOString()
      : null,
    verified_by: values.verified ? userId : null,
    created_by: userId,
    updated_by: userId,
  };

  const { data, error } = await supabase
    .from('competencies')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        `This client already has a ${getCompetencyCategoryLabel(
          values.category
        )} competency record.`
      );
    }

    throw new Error(error.message);
  }

  return mapCompetencyRecord(data as CompetencyRecord);
}

export async function updateCompetency(
  competencyId: string,
  dealerId: string,
  userId: string,
  values: CompetencyFormValues
): Promise<CompetencyListItem> {
  const { data: duplicate, error: duplicateError } =
    await supabase
      .from('competencies')
      .select('id')
      .eq('client_id', (
        await getCompetency(competencyId)
      ).client_id)
      .eq('category', values.category)
      .neq('id', competencyId)
      .maybeSingle();

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  if (duplicate) {
    throw new Error(
      `This client already has a ${getCompetencyCategoryLabel(
        values.category
      )} competency record.`
    );
  }

  const { data, error } = await supabase
    .from('competencies')
    .update({
      dealer_id: dealerId,
      category: values.category,
      certificate_number: emptyToNull(
        values.certificateNumber
      ),
      issue_date: normaliseDate(values.issueDate),
      expiry_date: normaliseDate(values.expiryDate),
      notes: emptyToNull(values.notes),
      verified: values.verified,
      verified_at: values.verified
        ? new Date().toISOString()
        : null,
      verified_by: values.verified ? userId : null,
      updated_by: userId,
    })
    .eq('id', competencyId)
    .eq('dealer_id', dealerId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        `This client already has a ${getCompetencyCategoryLabel(
          values.category
        )} competency record.`
      );
    }

    throw new Error(error.message);
  }

  return mapCompetencyRecord(data as CompetencyRecord);
}

export async function deleteCompetency(
  competencyId: string,
  dealerId: string
): Promise<void> {
  const { error } = await supabase
    .from('competencies')
    .delete()
    .eq('id', competencyId)
    .eq('dealer_id', dealerId);

  if (error) {
    throw new Error(error.message);
  }
}