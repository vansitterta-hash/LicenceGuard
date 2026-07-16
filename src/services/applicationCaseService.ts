import { supabase } from '../lib/supabase';
import {
  CLOSED_APPLICATION_CASE_STATUSES,
  getApplicationCaseTypeLabel,
  isCompetencyApplicationType,
  isFirearmApplicationType,
  type ApplicationCaseFormValues,
  type ApplicationCaseListItem,
  type ApplicationCaseRecord,
  type ApplicationCaseSubjectOption,
  type ApplicationCaseType,
} from '../types/applicationCase';

const DAY_IN_MILLISECONDS = 86_400_000;

type ClientRow = {
  id: string;
  first_name: string;
  surname: string;
  id_number: string;
};

type FirearmRow = {
  id: string;
  make: string;
  model: string | null;
  calibre: string;
  serial_number: string;
};

type CompetencyRow = {
  id: string;
  category: string;
  certificate_number: string | null;
};

type FirearmLicenceRow = {
  id: string;
  firearm_id: string;
  licence_number: string | null;
  expiry_date: string;
};

type ApplicationCaseContext = {
  client: ClientRow;
  firearms: FirearmRow[];
  competencies: CompetencyRow[];
  licences: FirearmLicenceRow[];
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function calculateDaysUntil(
  dateValue: string | null
): number | null {
  if (!dateValue) {
    return null;
  }

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

function describeFirearm(
  firearm: FirearmRow
): string {
  return [
    firearm.make,
    firearm.model,
    firearm.calibre,
    firearm.serial_number,
  ]
    .filter(Boolean)
    .join(' • ');
}

function formatCompetencyCategory(
  category: string
): string {
  switch (category) {
    case 'HANDGUN':
      return 'Handgun';

    case 'RIFLE':
      return 'Manually operated rifle or carbine';

    case 'SHOTGUN':
      return 'Shotgun';

    case 'SLR':
      return 'Self-loading rifle or carbine';

    default:
      return category;
  }
}

function buildSubjectDescription(
  applicationCase: ApplicationCaseRecord,
  context: ApplicationCaseContext
): {
  subjectDescription: string;
  firearmDescription: string | null;
} {
  if (
    isCompetencyApplicationType(
      applicationCase.application_type
    )
  ) {
    return {
      subjectDescription:
        applicationCase.competency_category
          ? formatCompetencyCategory(
              applicationCase.competency_category
            )
          : getApplicationCaseTypeLabel(
              applicationCase.application_type
            ),
      firearmDescription: null,
    };
  }

  const firearm = context.firearms.find(
    (item) => item.id === applicationCase.firearm_id
  );

  const firearmDescription = firearm
    ? describeFirearm(firearm)
    : 'Firearm details unavailable';

  return {
    subjectDescription: firearmDescription,
    firearmDescription,
  };
}

function mapApplicationCase(
  applicationCase: ApplicationCaseRecord,
  context: ApplicationCaseContext
): ApplicationCaseListItem {
  const daysUntilTarget = calculateDaysUntil(
    applicationCase.target_submission_date
  );

  const isOpen =
    !CLOSED_APPLICATION_CASE_STATUSES.includes(
      applicationCase.status
    );

  const subject = buildSubjectDescription(
    applicationCase,
    context
  );

  return {
    ...applicationCase,

    clientName: `${context.client.first_name} ${context.client.surname}`,
    clientIdNumber: context.client.id_number,

    subjectDescription:
      subject.subjectDescription,
    firearmDescription:
      subject.firearmDescription,

    isOpen,
    isOverdue:
      isOpen &&
      daysUntilTarget !== null &&
      daysUntilTarget < 0,

    daysUntilTarget,
  };
}

async function loadApplicationCaseContext(
  clientId: string
): Promise<ApplicationCaseContext> {
  const [
    clientResult,
    firearmsResult,
    competenciesResult,
    licencesResult,
  ] = await Promise.all([
    supabase
      .from('clients')
      .select(
        `
        id,
        first_name,
        surname,
        id_number
        `
      )
      .eq('id', clientId)
      .single(),

    supabase
      .from('firearms')
      .select(
        `
        id,
        make,
        model,
        calibre,
        serial_number
        `
      )
      .eq('client_id', clientId)
      .eq('is_active', true),

    supabase
      .from('competencies')
      .select(
        `
        id,
        category,
        certificate_number
        `
      )
      .eq('client_id', clientId),

    supabase
      .from('firearm_licences')
      .select(
        `
        id,
        firearm_id,
        licence_number,
        expiry_date
        `
      )
      .eq('client_id', clientId),
  ]);

  const firstError =
    clientResult.error ??
    firearmsResult.error ??
    competenciesResult.error ??
    licencesResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    client: clientResult.data as ClientRow,
    firearms:
      (firearmsResult.data ?? []) as FirearmRow[],
    competencies:
      (competenciesResult.data ??
        []) as CompetencyRow[],
    licences:
      (licencesResult.data ??
        []) as FirearmLicenceRow[],
  };
}

export async function listClientApplicationCases(
  clientId: string
): Promise<ApplicationCaseListItem[]> {
  const [casesResult, context] =
    await Promise.all([
      supabase
        .from('application_cases')
        .select('*')
        .eq('client_id', clientId)
        .order('opened_date', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        }),

      loadApplicationCaseContext(clientId),
    ]);

  if (casesResult.error) {
    throw new Error(casesResult.error.message);
  }

  return (
    (casesResult.data ??
      []) as ApplicationCaseRecord[]
  ).map((applicationCase) =>
    mapApplicationCase(
      applicationCase,
      context
    )
  );
}

export async function getApplicationCase(
  applicationCaseId: string
): Promise<ApplicationCaseListItem> {
  const { data, error } = await supabase
    .from('application_cases')
    .select('*')
    .eq('id', applicationCaseId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const applicationCase =
    data as ApplicationCaseRecord;

  const context =
    await loadApplicationCaseContext(
      applicationCase.client_id
    );

  return mapApplicationCase(
    applicationCase,
    context
  );
}

export async function getApplicationCaseSubjectOptions(
  clientId: string,
  applicationType: ApplicationCaseType
): Promise<ApplicationCaseSubjectOption[]> {
  const context =
    await loadApplicationCaseContext(clientId);

  if (
    isCompetencyApplicationType(applicationType)
  ) {
    return context.competencies.map(
      (competency) => ({
        id: competency.id,
        label: formatCompetencyCategory(
          competency.category
        ),
        secondaryLabel:
          competency.certificate_number
            ? `Certificate ${competency.certificate_number}`
            : 'Certificate number not recorded',
      })
    );
  }

  if (isFirearmApplicationType(applicationType)) {
    return context.firearms.map((firearm) => {
      const licence = context.licences.find(
        (item) =>
          item.firearm_id === firearm.id
      );

      return {
        id: firearm.id,
        label: describeFirearm(firearm),
        secondaryLabel: licence
          ? `Licence ${
              licence.licence_number ??
              'not recorded'
            } • Expires ${licence.expiry_date}`
          : 'No current licence recorded',
      };
    });
  }

  return [];
}

function buildPayload(
  dealerId: string,
  clientId: string,
  userId: string,
  values: ApplicationCaseFormValues
) {
  const competencyApplication =
    isCompetencyApplicationType(
      values.applicationType
    );

  const firearmApplication =
    isFirearmApplicationType(
      values.applicationType
    );

  const progressPercent = Number.parseInt(
    values.progressPercent,
    10
  );

  return {
    dealer_id: dealerId,
    client_id: clientId,

    application_type:
      values.applicationType,
    status: values.status,

    competency_category:
      competencyApplication
        ? values.competencyCategory
        : null,

    competency_id:
      competencyApplication
        ? emptyToNull(values.competencyId)
        : null,

    firearm_id:
      firearmApplication
        ? emptyToNull(values.firearmId)
        : null,

    firearm_licence_id:
      firearmApplication
        ? emptyToNull(
            values.firearmLicenceId
          )
        : null,

    licence_section:
      firearmApplication
        ? emptyToNull(values.licenceSection)
        : null,

    opened_date: values.openedDate.trim(),

    target_submission_date: emptyToNull(
      values.targetSubmissionDate
    ),

    actual_submission_date: emptyToNull(
      values.actualSubmissionDate
    ),

    application_reference: emptyToNull(
      values.applicationReference
    ),

    police_station: emptyToNull(
      values.policeStation
    ),

    outcome_date: emptyToNull(
      values.outcomeDate
    ),

    outcome_notes: emptyToNull(
      values.outcomeNotes
    ),

    progress_percent: Number.isNaN(
      progressPercent
    )
      ? 0
      : Math.max(
          0,
          Math.min(100, progressPercent)
        ),

    dealer_notes: emptyToNull(
      values.dealerNotes
    ),

    client_notes: emptyToNull(
      values.clientNotes
    ),

    updated_by: userId,
  };
}

export async function createApplicationCase(
  dealerId: string,
  clientId: string,
  userId: string,
  values: ApplicationCaseFormValues
): Promise<ApplicationCaseListItem> {
  validateRequiredLinks(values);

  const { data, error } = await supabase
    .from('application_cases')
    .insert({
      ...buildPayload(
        dealerId,
        clientId,
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

  const context =
    await loadApplicationCaseContext(clientId);

  return mapApplicationCase(
    data as ApplicationCaseRecord,
    context
  );
}

export async function updateApplicationCase(
  applicationCaseId: string,
  dealerId: string,
  clientId: string,
  userId: string,
  values: ApplicationCaseFormValues
): Promise<ApplicationCaseListItem> {
  validateRequiredLinks(values);

  const { data, error } = await supabase
    .from('application_cases')
    .update(
      buildPayload(
        dealerId,
        clientId,
        userId,
        values
      )
    )
    .eq('id', applicationCaseId)
    .eq('dealer_id', dealerId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const context =
    await loadApplicationCaseContext(clientId);

  return mapApplicationCase(
    data as ApplicationCaseRecord,
    context
  );
}

export async function deleteApplicationCase(
  applicationCaseId: string,
  dealerId: string
): Promise<void> {
  const { error } = await supabase
    .from('application_cases')
    .delete()
    .eq('id', applicationCaseId)
    .eq('dealer_id', dealerId);

  if (error) {
    throw new Error(error.message);
  }
}

function validateRequiredLinks(
  values: ApplicationCaseFormValues
): void {
  if (
    isCompetencyApplicationType(
      values.applicationType
    ) &&
    !values.competencyCategory
  ) {
    throw new Error(
      'Select a competency category for this application.'
    );
  }

  if (
    isFirearmApplicationType(
      values.applicationType
    ) &&
    !values.firearmId.trim()
  ) {
    throw new Error(
      'Select a firearm for this application.'
    );
  }

  if (!values.openedDate.trim()) {
    throw new Error(
      'Enter the application opened date.'
    );
  }
}