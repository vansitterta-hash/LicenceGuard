export type NotificationChannel =
  | 'WHATSAPP'
  | 'EMAIL'
  | 'SMS'
  | 'PHONE'
  | 'MANUAL';

export type ClientRecord = {
  id: string;

  dealer_id: string;

  first_name: string;
  surname: string;

  id_number: string;

  cellphone: string | null;
  alternate_cellphone: string | null;

  email: string | null;

  preferred_contact_channel: NotificationChannel;

  address_line_1: string | null;
  address_line_2: string | null;

  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;

  notes: string | null;

  is_active: boolean;

  created_at: string;
  updated_at: string;
};

export type ClientFormValues = {
  firstName: string;
  surname: string;

  idNumber: string;

  cellphone: string;
  alternateCellphone: string;

  email: string;

  preferredContactChannel: NotificationChannel;

  addressLine1: string;
  addressLine2: string;

  suburb: string;
  city: string;
  province: string;
  postalCode: string;

  notes: string;
};

export type ClientProfileSummary = ClientRecord & {
  competencies_count: number;

  firearms_count: number;

  licences_count: number;

  renewals_count: number;
};