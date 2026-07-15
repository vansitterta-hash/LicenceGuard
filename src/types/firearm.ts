import type { CompetencyCategory } from './competency';

export type FirearmType =
  | 'PISTOL'
  | 'REVOLVER'
  | 'BOLT_ACTION_RIFLE'
  | 'LEVER_ACTION_RIFLE'
  | 'MANUAL_RIFLE'
  | 'MANUAL_CARBINE'
  | 'SHOTGUN'
  | 'SELF_LOADING_RIFLE'
  | 'HAND_MACHINE_CARBINE'
  | 'PISTOL_CALIBRE_CARBINE'
  | 'OTHER';

export type LicenceStatus =
  | 'VALID'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'RENEWAL_IN_PROGRESS'
  | 'SUBMITTED'
  | 'RENEWED'
  | 'CANCELLED';

export type FirearmRecord = {
  id: string;
  dealer_id: string;
  client_id: string;

  make: string;
  model: string | null;
  calibre: string;
  serial_number: string;

  firearm_type: FirearmType;
  required_competency: CompetencyCategory;
  competency_override_reason: string | null;

  notes: string | null;
  is_active: boolean;

  created_by: string | null;
  updated_by: string | null;

  created_at: string;
  updated_at: string;
};

export type FirearmLicenceRecord = {
  id: string;
  dealer_id: string;
  client_id: string;
  firearm_id: string;

  licence_number: string | null;
  licence_section: string | null;
  issue_date: string | null;
  expiry_date: string;
  status: LicenceStatus;

  scanned_licence_url: string | null;
  submitted_date: string | null;
  approval_date: string | null;
  new_expiry_date: string | null;

  notes: string | null;

  created_by: string | null;
  updated_by: string | null;

  created_at: string;
  updated_at: string;
};

export type FirearmListItem = FirearmRecord & {
  licence: FirearmLicenceRecord | null;
  daysUntilExpiry: number | null;
  licenceHealth:
    | 'VALID'
    | 'APPROACHING'
    | 'RENEWAL_DUE'
    | 'URGENT'
    | 'EXPIRED'
    | 'NO_LICENCE';
};

export type FirearmFormValues = {
  make: string;
  model: string;
  calibre: string;
  serialNumber: string;

  firearmType: FirearmType;
  requiredCompetency: CompetencyCategory;
  competencyOverrideReason: string;

  firearmNotes: string;

  licenceNumber: string;
  licenceSection: string;
  licenceIssueDate: string;
  licenceExpiryDate: string;
  licenceStatus: LicenceStatus;
  licenceNotes: string;
};

export const FIREARM_TYPES: Array<{
  value: FirearmType;
  label: string;
  requiredCompetency: CompetencyCategory;
}> = [
  {
    value: 'PISTOL',
    label: 'Pistol',
    requiredCompetency: 'HANDGUN',
  },
  {
    value: 'REVOLVER',
    label: 'Revolver',
    requiredCompetency: 'HANDGUN',
  },
  {
    value: 'BOLT_ACTION_RIFLE',
    label: 'Bolt-action rifle',
    requiredCompetency: 'RIFLE',
  },
  {
    value: 'LEVER_ACTION_RIFLE',
    label: 'Lever-action rifle',
    requiredCompetency: 'RIFLE',
  },
  {
    value: 'MANUAL_RIFLE',
    label: 'Manually operated rifle',
    requiredCompetency: 'RIFLE',
  },
  {
    value: 'MANUAL_CARBINE',
    label: 'Manually operated carbine',
    requiredCompetency: 'RIFLE',
  },
  {
    value: 'SHOTGUN',
    label: 'Shotgun',
    requiredCompetency: 'SHOTGUN',
  },
  {
    value: 'SELF_LOADING_RIFLE',
    label: 'Self-loading rifle',
    requiredCompetency: 'SLR',
  },
  {
    value: 'HAND_MACHINE_CARBINE',
    label: 'Hand machine carbine',
    requiredCompetency: 'SLR',
  },
  {
    value: 'PISTOL_CALIBRE_CARBINE',
    label: 'Pistol-calibre carbine',
    requiredCompetency: 'SLR',
  },
  {
    value: 'OTHER',
    label: 'Other',
    requiredCompetency: 'HANDGUN',
  },
];

export const LICENCE_STATUSES: Array<{
  value: LicenceStatus;
  label: string;
}> = [
  { value: 'VALID', label: 'Valid' },
  { value: 'EXPIRING', label: 'Expiring' },
  { value: 'EXPIRED', label: 'Expired' },
  {
    value: 'RENEWAL_IN_PROGRESS',
    label: 'Renewal in progress',
  },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'RENEWED', label: 'Renewed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
