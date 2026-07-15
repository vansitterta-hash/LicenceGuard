import { supabase } from '../lib/supabase';
import type { CompetencyCategory } from '../types/competency';

const DAY_IN_MILLISECONDS = 86_400_000;

export type ApplicationCaseType =
  | 'COMPETENCY_FIRST_APPLICATION'
  | 'COMPETENCY_RENEWAL'
  | 'FIREARM_LICENCE_FIRST_APPLICATION'
  | 'FIREARM_LICENCE_RENEWAL';

export type ApplicationCaseStatus =
  | 'NOT_STARTED'
  | 'CLIENT_CONTACTED'
  | 'DOCUMENTS_REQUESTED'
  | 'DOCUMENTS_INCOMPLETE'
  | 'DOCUMENTS_COMPLETE'
  | 'PACK_IN_PREPARATION'
  | 'READY_FOR_SUBMISSION'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'CLOSED';

export type ApplicationReadinessStatus =
  | 'READY'
  | 'ACTION_REQUIRED'
  | 'BLOCKED'
  | 'NO_DATA';

export type ApplicationIssueSeverity =
  | 'info'
  | 'warning'
  | 'critical';

export type ApplicationIssue = {
  code: string;
  title: string;
  detail: string;
  severity: ApplicationIssueSeverity;
};

export type CompetencyApplicationItem = {
  id: string;
  category: CompetencyCategory;
  certificateNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verified: boolean;
  daysUntilExpiry: number | null;
  health:
    | 'VALID'
    | 'RENEWAL_DUE'
    | 'URGENT'
    | 'EXPIRED'
    | 'INCOMPLETE';
};

export type FirearmApplicationItem = {
  id: string;
  make: string;
  model: string | null;
  calibre: string;
  serialNumber: string;
  firearmType: string;
  requiredCompetency: CompetencyCategory;
  matchingCompetencyId: string | null;
  matchingCompetencyHealth:
    | CompetencyApplicationItem['health']
    | 'NOT_RECORDED';
  licenceId: string | null;
  licenceNumber: string | null;
  licenceSection: string | null;
  licenceIssueDate: string | null;
  licenceExpiryDate: string | null;
  licenceDaysUntilExpiry: number | null;
  licenceHealth:
    | 'VALID'
    | 'RENEWAL_DUE'
    | 'URGENT'
    | 'EXPIRED'
    | 'NOT_ISSUED';
};

export type ApplicationCaseItem = {
  id: string;
  applicationType: ApplicationCaseType;
  status: ApplicationCaseStatus;
  competencyCategory: CompetencyCategory | null;
  competencyId: string | null;
  firearmId: string | null;
  firearmLicenceId: string | null;
  openedDate: string;
  targetSubmissionDate: string | null;
  actualSubmissionDate: string | null;
  applicationReference: string | null;
  policeStation: string | null;
  progressPercent: number;
};

export type ClientApplicationSummary = {
  clientId: string;
  status: ApplicationReadinessStatus;
  score: number;
  nextAction: string;

  issues: ApplicationIssue[];
  warnings: ApplicationIssue[];

  competencies: CompetencyApplicationItem[];
  firearms: FirearmApplicationItem[];
  cases: ApplicationCaseItem[];

  availableCompetencyApplications: CompetencyCategory[];

  counts: {
    competencies: number;
    firearms: number;
    issuedLicences: number;
    firstLicenceCandidates: number;
    openApplications: number;
    documents: number;
  };
};

type CompetencyRow = {
  id: string;
  category: CompetencyCategory;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  verified: boolean;
};

type FirearmRow = {
  id: string;
  make: string;
  model: string | null;
  calibre: string;
  serial_number: string;
  firearm_type: string;
  required_competency: CompetencyCategory;
};

type LicenceRow = {
  id: string;
  firearm_id: string;
  licence_number: string | null;
  licence_section: string | null;
  issue_date: string | null;
  expiry_date: string;
  status: string;
};

type ApplicationCaseRow = {
  id: string;
  application_type: ApplicationCaseType;
  status: ApplicationCaseStatus;
  competency_category: CompetencyCategory | null;
  competency_id: string | null;
  firearm_id: string | null;
  firearm_licence_id: string | null;
  opened_date: string;
  target_submission_date: string | null;
  actual_submission_date: string | null;
  application_reference: string | null;
  police_station: string | null;
  progress_percent: number;
};

const ALL_COMPETENCY_CATEGORIES: CompetencyCategory[] = [
  'HANDGUN',
  'RIFLE',
  'SHOTGUN',
  'SLR',
];

const CLOSED_APPLICATION_STATUSES: ApplicationCaseStatus[] = [
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'CLOSED',
];

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

function getCompetencyHealth(
  competency: CompetencyRow
): CompetencyApplicationItem['health'] {
  if (
    !competency.certificate_number ||
    !competency.issue_date ||
    !competency.expiry_date
  ) {
    return 'INCOMPLETE';
  }

  const daysUntilExpiry = calculateDaysUntil(
    competency.expiry_date
  );

  if (daysUntilExpiry < 0) {
    return 'EXPIRED';
  }

  if (daysUntilExpiry <= 90) {
    return 'URGENT';
  }

  if (daysUntilExpiry <= 120) {
    return 'RENEWAL_DUE';
  }

  return 'VALID';
}

function getLicenceHealth(
  expiryDate: string | null
): FirearmApplicationItem['licenceHealth'] {
  if (!expiryDate) {
    return 'NOT_ISSUED';
  }

  const daysUntilExpiry = calculateDaysUntil(expiryDate);

  if (daysUntilExpiry < 0) {
    return 'EXPIRED';
  }

  if (daysUntilExpiry <= 90) {
    return 'URGENT';
  }

  if (daysUntilExpiry <= 120) {
    return 'RENEWAL_DUE';
  }

  return 'VALID';
}

function formatCompetencyCategory(
  category: CompetencyCategory
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
  }
}

function describeFirearm(firearm: FirearmRow): string {
  return [
    firearm.make,
    firearm.model,
    firearm.calibre,
    firearm.serial_number,
  ]
    .filter(Boolean)
    .join(' · ');
}

function isCaseOpen(status: ApplicationCaseStatus): boolean {
  return !CLOSED_APPLICATION_STATUSES.includes(status);
}

function removeDuplicateIssues(
  issues: ApplicationIssue[]
): ApplicationIssue[] {
  return Array.from(
    new Map(
      issues.map((issue) => [issue.code, issue])
    ).values()
  );
}

export async function getClientApplicationSummary(
  clientId: string
): Promise<ClientApplicationSummary> {
  const [
    competenciesResult,
    firearmsResult,
    licencesResult,
    casesResult,
    documentsResult,
  ] = await Promise.all([
    supabase
      .from('competencies')
      .select(
        `
        id,
        category,
        certificate_number,
        issue_date,
        expiry_date,
        verified
        `
      )
      .eq('client_id', clientId),

    supabase
      .from('firearms')
      .select(
        `
        id,
        make,
        model,
        calibre,
        serial_number,
        firearm_type,
        required_competency
        `
      )
      .eq('client_id', clientId)
      .eq('is_active', true),

    supabase
      .from('firearm_licences')
      .select(
        `
        id,
        firearm_id,
        licence_number,
        licence_section,
        issue_date,
        expiry_date,
        status
        `
      )
      .eq('client_id', clientId),

    supabase
      .from('application_cases')
      .select(
        `
        id,
        application_type,
        status,
        competency_category,
        competency_id,
        firearm_id,
        firearm_licence_id,
        opened_date,
        target_submission_date,
        actual_submission_date,
        application_reference,
        police_station,
        progress_percent
        `
      )
      .eq('client_id', clientId)
      .order('opened_date', { ascending: false }),

    supabase
      .from('documents')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('client_id', clientId),
  ]);

  const firstError =
    competenciesResult.error ??
    firearmsResult.error ??
    licencesResult.error ??
    casesResult.error ??
    documentsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const competencyRows =
    (competenciesResult.data ?? []) as CompetencyRow[];

  const firearmRows =
    (firearmsResult.data ?? []) as FirearmRow[];

  const licenceRows =
    (licencesResult.data ?? []) as LicenceRow[];

  const caseRows =
    (casesResult.data ?? []) as ApplicationCaseRow[];

  const competencies: CompetencyApplicationItem[] =
    competencyRows.map((competency) => ({
      id: competency.id,
      category: competency.category,
      certificateNumber: competency.certificate_number,
      issueDate: competency.issue_date,
      expiryDate: competency.expiry_date,
      verified: competency.verified,
      daysUntilExpiry: competency.expiry_date
        ? calculateDaysUntil(competency.expiry_date)
        : null,
      health: getCompetencyHealth(competency),
    }));

  const competencyByCategory = new Map(
    competencies.map((competency) => [
      competency.category,
      competency,
    ])
  );

  const licenceByFirearmId = new Map(
    licenceRows.map((licence) => [
      licence.firearm_id,
      licence,
    ])
  );

  const firearms: FirearmApplicationItem[] =
    firearmRows.map((firearm) => {
      const competency = competencyByCategory.get(
        firearm.required_competency
      );

      const licence = licenceByFirearmId.get(firearm.id);

      return {
        id: firearm.id,
        make: firearm.make,
        model: firearm.model,
        calibre: firearm.calibre,
        serialNumber: firearm.serial_number,
        firearmType: firearm.firearm_type,
        requiredCompetency: firearm.required_competency,

        matchingCompetencyId:
          competency?.id ?? null,

        matchingCompetencyHealth:
          competency?.health ?? 'NOT_RECORDED',

        licenceId: licence?.id ?? null,
        licenceNumber: licence?.licence_number ?? null,
        licenceSection: licence?.licence_section ?? null,
        licenceIssueDate: licence?.issue_date ?? null,
        licenceExpiryDate: licence?.expiry_date ?? null,

        licenceDaysUntilExpiry: licence?.expiry_date
          ? calculateDaysUntil(licence.expiry_date)
          : null,

        licenceHealth: getLicenceHealth(
          licence?.expiry_date ?? null
        ),
      };
    });

  const cases: ApplicationCaseItem[] =
    caseRows.map((applicationCase) => ({
      id: applicationCase.id,
      applicationType:
        applicationCase.application_type,
      status: applicationCase.status,
      competencyCategory:
        applicationCase.competency_category,
      competencyId: applicationCase.competency_id,
      firearmId: applicationCase.firearm_id,
      firearmLicenceId:
        applicationCase.firearm_licence_id,
      openedDate: applicationCase.opened_date,
      targetSubmissionDate:
        applicationCase.target_submission_date,
      actualSubmissionDate:
        applicationCase.actual_submission_date,
      applicationReference:
        applicationCase.application_reference,
      policeStation: applicationCase.police_station,
      progressPercent:
        applicationCase.progress_percent,
    }));

  const openCases = cases.filter((applicationCase) =>
    isCaseOpen(applicationCase.status)
  );

  const issues: ApplicationIssue[] = [];
  const warnings: ApplicationIssue[] = [];

  competencies.forEach((competency) => {
    const categoryLabel = formatCompetencyCategory(
      competency.category
    );

    if (!competency.verified) {
      warnings.push({
        code: `COMPETENCY_UNVERIFIED_${competency.id}`,
        title: `${categoryLabel} competency not verified`,
        detail:
          'Verify the competency certificate before using it for an application or renewal.',
        severity: 'warning',
      });
    }

    if (competency.health === 'INCOMPLETE') {
      issues.push({
        code: `COMPETENCY_INCOMPLETE_${competency.id}`,
        title: `${categoryLabel} competency record incomplete`,
        detail:
          'Complete the certificate number, issue date and expiry information.',
        severity: 'critical',
      });
    }

    if (competency.health === 'EXPIRED') {
      issues.push({
        code: `COMPETENCY_EXPIRED_${competency.id}`,
        title: `${categoryLabel} competency expired`,
        detail:
          'Open or continue a competency renewal application.',
        severity: 'critical',
      });
    }

    if (
      competency.health === 'URGENT' ||
      competency.health === 'RENEWAL_DUE'
    ) {
      warnings.push({
        code: `COMPETENCY_DUE_${competency.id}`,
        title: `${categoryLabel} competency renewal due`,
        detail: `The competency expires in ${
          competency.daysUntilExpiry ?? 0
        } days.`,
        severity: 'warning',
      });
    }
  });

  firearms.forEach((firearm) => {
    const firearmLabel = describeFirearm({
      id: firearm.id,
      make: firearm.make,
      model: firearm.model,
      calibre: firearm.calibre,
      serial_number: firearm.serialNumber,
      firearm_type: firearm.firearmType,
      required_competency:
        firearm.requiredCompetency,
    });

    if (
      firearm.matchingCompetencyHealth ===
      'NOT_RECORDED'
    ) {
      const categoryLabel = formatCompetencyCategory(
        firearm.requiredCompetency
      );

      issues.push({
        code: `COMPETENCY_CATEGORY_NOT_RECORDED_${firearm.requiredCompetency}`,
        title: `${categoryLabel} competency not recorded`,
        detail:
          `Capture or apply for the matching ${categoryLabel.toLowerCase()} competency before preparing a firearm licence application for ${firearmLabel}.`,
        severity: 'critical',
      });
    }

    if (firearm.licenceHealth === 'NOT_ISSUED') {
      const matchingFirstApplication = openCases.some(
        (applicationCase) =>
          applicationCase.applicationType ===
            'FIREARM_LICENCE_FIRST_APPLICATION' &&
          applicationCase.firearmId === firearm.id
      );

      if (!matchingFirstApplication) {
        warnings.push({
          code: `FIRST_LICENCE_APPLICATION_AVAILABLE_${firearm.id}`,
          title: 'First firearm licence application available',
          detail:
            `${firearmLabel} has no issued licence recorded. A first-time firearm licence application may be opened once competency requirements are satisfied.`,
          severity: 'info',
        });
      }
    }

    if (firearm.licenceHealth === 'EXPIRED') {
      issues.push({
        code: `LICENCE_EXPIRED_${firearm.id}`,
        title: 'Firearm licence expired',
        detail:
          `${firearmLabel} requires urgent review. LicenceGuard should not treat this as an ordinary renewal.`,
        severity: 'critical',
      });
    }

    if (
      firearm.licenceHealth === 'URGENT' ||
      firearm.licenceHealth === 'RENEWAL_DUE'
    ) {
      warnings.push({
        code: `LICENCE_DUE_${firearm.id}`,
        title: 'Firearm licence renewal due',
        detail:
          `${firearmLabel} expires in ${
            firearm.licenceDaysUntilExpiry ?? 0
          } days.`,
        severity: 'warning',
      });
    }
  });

  const availableCompetencyApplications =
    ALL_COMPETENCY_CATEGORIES.filter(
      (category) =>
        !competencyByCategory.has(category) &&
        !openCases.some(
          (applicationCase) =>
            applicationCase.applicationType ===
              'COMPETENCY_FIRST_APPLICATION' &&
            applicationCase.competencyCategory ===
              category
        )
    );

  const uniqueIssues = removeDuplicateIssues(issues);
  const uniqueWarnings =
    removeDuplicateIssues(warnings);

  let status: ApplicationReadinessStatus = 'READY';
  let nextAction =
    'Review active application cases and upcoming expiry dates.';

  if (
    competencies.length === 0 &&
    firearms.length === 0 &&
    cases.length === 0
  ) {
    status = 'NO_DATA';
    nextAction =
      'Start a first-time competency application or capture an existing competency.';
  } else if (uniqueIssues.length > 0) {
    status = 'BLOCKED';
    nextAction =
      uniqueIssues[0]?.detail ??
      'Resolve the critical application issues.';
  } else if (
    uniqueWarnings.length > 0 ||
    openCases.length > 0
  ) {
    status = 'ACTION_REQUIRED';

    nextAction =
      openCases.length > 0
        ? 'Continue the client’s active application cases.'
        : uniqueWarnings[0]?.detail ??
          'Review the required application actions.';
  }

  const issuePenalty = uniqueIssues.length * 20;
  const warningPenalty = uniqueWarnings.length * 7;

  const score =
    status === 'NO_DATA'
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            100 - issuePenalty - warningPenalty
          )
        );

  return {
    clientId,
    status,
    score,
    nextAction,

    issues: uniqueIssues,
    warnings: uniqueWarnings,

    competencies,
    firearms,
    cases,

    availableCompetencyApplications,

    counts: {
      competencies: competencies.length,
      firearms: firearms.length,
      issuedLicences: firearms.filter(
        (firearm) =>
          firearm.licenceHealth !== 'NOT_ISSUED'
      ).length,
      firstLicenceCandidates: firearms.filter(
        (firearm) =>
          firearm.licenceHealth === 'NOT_ISSUED'
      ).length,
      openApplications: openCases.length,
      documents: documentsResult.count ?? 0,
    },
  };
}