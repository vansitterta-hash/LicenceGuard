import { supabase } from '../lib/supabase';

export type ReadinessStatus =
  | 'READY'
  | 'ACTION_REQUIRED'
  | 'NOT_READY'
  | 'NO_DATA';

export type ReadinessSeverity =
  | 'info'
  | 'warning'
  | 'critical';

export type ReadinessIssue = {
  code: string;
  title: string;
  detail: string;
  severity: ReadinessSeverity;
};

export type CompetencyReadinessItem = {
  id: string;
  category: 'HANDGUN' | 'RIFLE' | 'SHOTGUN' | 'SLR';
  certificateNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  status:
    | 'VALID'
    | 'EXPIRING'
    | 'EXPIRED'
    | 'NO_EXPIRY_RECORDED';
};

export type LicenceReadinessItem = {
  id: string;
  firearmId: string;
  licenceNumber: string | null;
  licenceSection: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  status:
    | 'VALID'
    | 'EXPIRING'
    | 'EXPIRED'
    | 'RENEWAL_IN_PROGRESS'
    | 'SUBMITTED'
    | 'RENEWED'
    | 'CANCELLED';
  firearmDescription: string;
  requiredCompetency:
    | 'HANDGUN'
    | 'RIFLE'
    | 'SHOTGUN'
    | 'SLR';
};

export type RenewalReadiness = {
  clientId: string;
  status: ReadinessStatus;
  score: number;
  nextAction: string;
  renewalDue: boolean;
  issues: ReadinessIssue[];
  warnings: ReadinessIssue[];
  competencies: CompetencyReadinessItem[];
  licences: LicenceReadinessItem[];
  counts: {
    competencies: number;
    firearms: number;
    licences: number;
    openRenewals: number;
    documents: number;
  };
};

type CompetencyRow = {
  id: string;
  category: CompetencyReadinessItem['category'];
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
};

type FirearmRow = {
  id: string;
  make: string;
  model: string | null;
  calibre: string;
  serial_number: string;
  required_competency: LicenceReadinessItem['requiredCompetency'];
};

type LicenceRow = {
  id: string;
  firearm_id: string;
  licence_number: string | null;
  licence_section: string | null;
  expiry_date: string;
  status: LicenceReadinessItem['status'];
};

const DAY_IN_MILLISECONDS = 86_400_000;

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

function getCompetencyStatus(
  expiryDate: string | null
): CompetencyReadinessItem['status'] {
  if (!expiryDate) {
    return 'NO_EXPIRY_RECORDED';
  }

  const days = calculateDaysUntil(expiryDate);

  if (days < 0) {
    return 'EXPIRED';
  }

  if (days <= 120) {
    return 'EXPIRING';
  }

  return 'VALID';
}

function buildFirearmDescription(
  firearm: FirearmRow
): string {
  return [
    firearm.make,
    firearm.model,
    firearm.calibre,
    firearm.serial_number,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function getRenewalReadiness(
  clientId: string
): Promise<RenewalReadiness> {
  const [
    competenciesResult,
    firearmsResult,
    licencesResult,
    renewalsResult,
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
        expiry_date
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
        expiry_date,
        status
        `
      )
      .eq('client_id', clientId),

    supabase
      .from('application_cases')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('client_id', clientId)
      .not(
        'status',
        'in',
        '("APPROVED","DECLINED","CLOSED")'
      ),

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
    renewalsResult.error ??
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

  const firearmById = new Map(
    firearmRows.map((firearm) => [
      firearm.id,
      firearm,
    ])
  );

  const competencies: CompetencyReadinessItem[] =
    competencyRows.map((competency) => {
      const daysUntilExpiry = competency.expiry_date
        ? calculateDaysUntil(competency.expiry_date)
        : null;

      return {
        id: competency.id,
        category: competency.category,
        certificateNumber:
          competency.certificate_number,
        issueDate: competency.issue_date,
        expiryDate: competency.expiry_date,
        daysUntilExpiry,
        status: getCompetencyStatus(
          competency.expiry_date
        ),
      };
    });

  const licences: LicenceReadinessItem[] =
    licenceRows.map((licence) => {
      const firearm = firearmById.get(
        licence.firearm_id
      );

      return {
        id: licence.id,
        firearmId: licence.firearm_id,
        licenceNumber: licence.licence_number,
        licenceSection: licence.licence_section,
        expiryDate: licence.expiry_date,
        daysUntilExpiry: calculateDaysUntil(
          licence.expiry_date
        ),
        status: licence.status,
        firearmDescription: firearm
          ? buildFirearmDescription(firearm)
          : 'Firearm details unavailable',
        requiredCompetency:
          firearm?.required_competency ??
          'HANDGUN',
      };
    });

  const issues: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  if (firearmRows.length === 0) {
    issues.push({
      code: 'NO_FIREARMS',
      title: 'No firearms recorded',
      detail:
        'Add at least one firearm before a licence application can be prepared.',
      severity: 'critical',
    });
  }

  if (licences.length === 0) {
    issues.push({
      code: 'NO_LICENCES',
      title: 'No firearm licences recorded',
      detail:
        'Capture the client’s firearm licence details and expiry date.',
      severity: 'critical',
    });
  }

  const competencyByCategory = new Map(
    competencies.map((competency) => [
      competency.category,
      competency,
    ])
  );

  firearmRows.forEach((firearm) => {
    const requiredCompetency =
      competencyByCategory.get(
        firearm.required_competency
      );

    if (!requiredCompetency) {
      issues.push({
        code: `MISSING_COMPETENCY_${firearm.required_competency}`,
        title: `${firearm.required_competency} competency missing`,
        detail: `${buildFirearmDescription(
          firearm
        )} requires a matching ${
          firearm.required_competency
        } competency.`,
        severity: 'critical',
      });

      return;
    }

    if (requiredCompetency.status === 'EXPIRED') {
      issues.push({
        code: `EXPIRED_COMPETENCY_${requiredCompetency.id}`,
        title: `${requiredCompetency.category} competency expired`,
        detail:
          'The competency must be renewed or otherwise regularised before the related firearm renewal can proceed.',
        severity: 'critical',
      });
    }

    if (
      requiredCompetency.status ===
      'NO_EXPIRY_RECORDED'
    ) {
      warnings.push({
        code: `NO_COMPETENCY_EXPIRY_${requiredCompetency.id}`,
        title: `${requiredCompetency.category} competency expiry not recorded`,
        detail:
          'Confirm and capture the competency validity information.',
        severity: 'warning',
      });
    }

    if (
      requiredCompetency.status === 'EXPIRING'
    ) {
      warnings.push({
        code: `EXPIRING_COMPETENCY_${requiredCompetency.id}`,
        title: `${requiredCompetency.category} competency needs attention`,
        detail: `The competency expires in ${
          requiredCompetency.daysUntilExpiry ?? 0
        } days.`,
        severity: 'warning',
      });
    }
  });

  licences.forEach((licence) => {
    if (
      licence.daysUntilExpiry < 0 ||
      licence.status === 'EXPIRED'
    ) {
      issues.push({
        code: `EXPIRED_LICENCE_${licence.id}`,
        title: 'Firearm licence expired',
        detail: `${licence.firearmDescription} expired ${
          Math.abs(licence.daysUntilExpiry)
        } days ago.`,
        severity: 'critical',
      });

      return;
    }

    if (licence.daysUntilExpiry <= 90) {
      warnings.push({
        code: `URGENT_LICENCE_${licence.id}`,
        title: 'Licence renewal urgently due',
        detail: `${licence.firearmDescription} expires in ${licence.daysUntilExpiry} days.`,
        severity: 'warning',
      });

      return;
    }

    if (licence.daysUntilExpiry <= 120) {
      warnings.push({
        code: `DUE_LICENCE_${licence.id}`,
        title: 'Licence renewal due',
        detail: `${licence.firearmDescription} expires in ${licence.daysUntilExpiry} days.`,
        severity: 'warning',
      });

      return;
    }

    if (licence.daysUntilExpiry <= 180) {
      warnings.push({
        code: `UPCOMING_LICENCE_${licence.id}`,
        title: 'Licence renewal approaching',
        detail: `${licence.firearmDescription} expires in ${licence.daysUntilExpiry} days.`,
        severity: 'info',
      });
    }
  });

  const uniqueIssues = Array.from(
    new Map(
      issues.map((issue) => [
        issue.code,
        issue,
      ])
    ).values()
  );

  const uniqueWarnings = Array.from(
    new Map(
      warnings.map((warning) => [
        warning.code,
        warning,
      ])
    ).values()
  );

  const renewalDue = licences.some(
    (licence) =>
      licence.daysUntilExpiry <= 120 ||
      licence.status === 'EXPIRING' ||
      licence.status === 'EXPIRED' ||
      licence.status === 'RENEWAL_IN_PROGRESS'
  );

  let status: ReadinessStatus = 'READY';
  let nextAction = renewalDue
    ? 'Review the outstanding renewal requirements and prepare the application.'
    : 'No firearm licence renewal is currently due within the next 120 days.';

  if (
    firearmRows.length === 0 &&
    competencyRows.length === 0 &&
    licenceRows.length === 0
  ) {
    status = 'NO_DATA';
    nextAction =
      'Add competencies, firearms and firearm licences.';
  } else if (uniqueIssues.length > 0) {
    status = 'NOT_READY';
    nextAction =
      uniqueIssues[0]?.detail ??
      'Resolve the critical renewal issues.';
  } else if (uniqueWarnings.length > 0) {
    status = 'ACTION_REQUIRED';
    nextAction =
      uniqueWarnings[0]?.detail ??
      'Review the upcoming renewal actions.';
  }

  const issuePenalty = uniqueIssues.length * 25;
  const warningPenalty = uniqueWarnings.length * 10;

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
    renewalDue,
    issues: uniqueIssues,
    warnings: uniqueWarnings,
    competencies,
    licences,
    counts: {
      competencies: competencyRows.length,
      firearms: firearmRows.length,
      licences: licenceRows.length,
      openRenewals:
        renewalsResult.count ?? 0,
      documents:
        documentsResult.count ?? 0,
    },
  };
}