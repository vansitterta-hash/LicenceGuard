export type CompetencyCategory =
  | 'HANDGUN'
  | 'RIFLE'
  | 'SHOTGUN'
  | 'SLR';

export type CompetencyStatus =
  | 'VALID'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'NO_EXPIRY_RECORDED';

export type CompetencyRecord = {
  id: string;
  dealer_id: string;
  client_id: string;

  category: CompetencyCategory;

  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;

  document_url: string | null;

  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;

  notes: string | null;

  created_by: string | null;
  updated_by: string | null;

  created_at: string;
  updated_at: string;
};

export type CompetencyFormValues = {
  category: CompetencyCategory;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  verified: boolean;
};

export type CompetencyListItem = CompetencyRecord & {
  status: CompetencyStatus;
  daysUntilExpiry: number | null;
};

export const COMPETENCY_CATEGORIES: Array<{
  value: CompetencyCategory;
  label: string;
  description: string;
}> = [
  {
    value: 'HANDGUN',
    label: 'Handgun',
    description:
      'Applies to pistols and revolvers.',
  },
  {
    value: 'RIFLE',
    label: 'Manually operated rifle or carbine',
    description:
      'Applies to bolt-action, lever-action, pump-action and other manually operated rifles or carbines.',
  },
  {
    value: 'SHOTGUN',
    label: 'Shotgun',
    description:
      'Applies to shotguns requiring shotgun competency.',
  },
  {
    value: 'SLR',
    label: 'Self-loading rifle or carbine',
    description:
      'Applies to self-loading rifles, hand machine carbines and pistol-calibre carbines.',
  },
];