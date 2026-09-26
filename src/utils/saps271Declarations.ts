import type {
  DeclarationDetailKey,
  DeclarationKey,
  Saps271Declarations,
} from '../types/saps271Declarations';

// Official e271.pdf, G62–G67: two incident rows per question, pages 8–9.
export const DECLARATION_QUESTIONS: {
  key: DeclarationKey;
  number: number;
  label: string;
  details: DeclarationDetailKey[];
}[] = [
  {
    key: 'convictions',
    number: 62,
    label: 'Has the client ever been convicted of an offence in South Africa or elsewhere?',
    details: ['policeStation', 'caseNumber', 'charge', 'outcome'],
  },
  {
    key: 'pendingCases',
    number: 63,
    label: 'Are there any criminal cases currently pending against the client?',
    details: ['policeStation', 'caseNumber', 'offence'],
  },
  {
    key: 'lostStolen',
    number: 64,
    label: 'Have any of the client’s firearms ever been lost or stolen?',
    details: ['policeStation', 'caseNumber', 'circumstances', 'firearmDetails'],
  },
  {
    key: 'negligence',
    number: 65,
    label: 'Was a negligence case opened and investigated regarding a lost or stolen firearm?',
    details: ['policeStation', 'caseNumber', 'charge', 'outcome'],
  },
  {
    key: 'unfitness',
    number: 66,
    label: 'Has the client ever been declared unfit to possess a firearm?',
    details: ['policeStation', 'caseNumber', 'charge', 'dateFrom', 'period'],
  },
  {
    key: 'confiscation',
    number: 67,
    label: 'Has a firearm in the client’s possession ever been confiscated?',
    details: ['policeStation', 'caseNumber', 'circumstances', 'outcome'],
  },
];

export const DECLARATION_DETAIL_LABELS: Record<DeclarationDetailKey, string> = {
  policeStation: 'Police station',
  caseNumber: 'CAS / case number',
  charge: 'Charge',
  outcome: 'Outcome',
  offence: 'Offence',
  circumstances: 'Circumstances',
  firearmDetails: 'Details of firearm',
  dateFrom: 'Date from (YYYY-MM-DD)',
  period: 'Unfitness period',
};

export function emptySaps271Declarations(): Saps271Declarations {
  const answers: Saps271Declarations['answers'] = {
    convictions: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
    pendingCases: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
    lostStolen: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
    negligence: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
    unfitness: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
    confiscation: {
      answer: 'NOT_ANSWERED',
      incidents: [],
    },
  };

  return {
    answers,
    confirmedAt: null,
  };
}

export function declarationDataIssues(
  value: Saps271Declarations | null | undefined
): string[] {
  const issues: string[] = [];

  for (const question of DECLARATION_QUESTIONS) {
    const response = value?.answers?.[question.key];

    if (!response || !['YES', 'NO'].includes(response.answer)) {
      issues.push(`G${question.number}: Answer the declaration question.`);
    } else if (response.answer === 'YES') {
      if (!response.incidents?.length || response.incidents.length > 2) {
        issues.push(`G${question.number}: Supply one or two incident records.`);
      }

      for (const [index, incident] of (response.incidents ?? []).entries()) {
        for (const field of question.details) {
          if (!incident[field]?.trim()) {
            issues.push(
              `G${question.number}, incident ${index + 1}: ${DECLARATION_DETAIL_LABELS[field]} is required.`
            );
          }
        }

        const date = incident.dateFrom;

        if (
          question.key === 'unfitness' &&
          date?.trim() &&
          (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date
          )
        ) {
          issues.push(
            `G66, incident ${index + 1}: Enter a valid date from.`
          );
        }
      }
    }
  }

  return issues;
}

export function declarationReadinessIssues(
  value: Saps271Declarations | null | undefined,
  caseCreatedAt: string | null | undefined
): string[] {
  const issues = declarationDataIssues(value);
  const confirmed = Date.parse(value?.confirmedAt ?? '');
  const opened = Date.parse(caseCreatedAt ?? '');

  if (
    !Number.isFinite(confirmed) ||
    confirmed > Date.now() ||
    !Number.isFinite(opened) ||
    confirmed < opened
  ) {
    issues.push(
      'Review and confirm the SAPS 271 declarations in Edit client after this application was created.'
    );
  }

  return issues;
}

export function saps271DeclarationFields(
  value: Saps271Declarations | null | undefined
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const { key, details } of DECLARATION_QUESTIONS) {
    const response = value?.answers?.[key];

    fields[`applicant.declarations.${key}.answer`] =
      response?.answer === 'YES' || response?.answer === 'NO'
        ? response.answer
        : '';

    for (let index = 0; index < 2; index++) {
      for (const detail of details) {
        fields[`applicant.declarations.${key}.${index}.${detail}`] =
          response?.answer === 'YES'
            ? response.incidents?.[index]?.[detail]?.trim() ?? ''
            : '';
      }
    }
  }

  return fields;
}