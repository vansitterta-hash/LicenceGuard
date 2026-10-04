import type {
  ApplicationIntelligenceContext,
  ApplicationIntelligenceResult,
  MotivationRecommendation,
  FirearmInformationRecommendation,
  IntelligenceMatchReason,
} from './types';

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchReason(
  field: string,
  value: string,
  explanation: string
): IntelligenceMatchReason {
  return {
    field,
    value,
    explanation,
  };
}


function calculateFirearmMatch(
  context: ApplicationIntelligenceContext
): FirearmInformationRecommendation['firearmMatch'] {
  return {
    calibreMatched: Boolean(context.firearm?.calibre),
    makeMatched: Boolean(context.firearm?.make),
    modelMatched: Boolean(context.firearm?.model),
    firearmTypeMatched: Boolean(context.firearm?.firearmType),
  };
}


function buildMotivationRecommendation(
  context: ApplicationIntelligenceContext
): MotivationRecommendation | null {

  if (!context.firearm) return null;

  const reasons: IntelligenceMatchReason[] = [];

  reasons.push(
    matchReason(
      'calibre',
      context.firearm.calibre,
      'Motivation selected based on firearm calibre compatibility.'
    )
  );

  if (context.licenceSection) {
    reasons.push(
      matchReason(
        'licenceSection',
        context.licenceSection,
        'Licence section considered when selecting motivation purpose.'
      )
    );
  }

  const primaryPurpose = context.primaryPurpose ?? context.intendedUse;
  if (primaryPurpose) {
    reasons.push(
      matchReason(
        'primaryPurpose',
        primaryPurpose,
        'The applicant’s stated lawful purpose was included so the motivation remains personalised.'
      )
    );
  }

  if (context.sportDiscipline) {
    reasons.push(
      matchReason(
        'sportDiscipline',
        context.sportDiscipline,
        'The specific sport discipline/category was included to keep the motivation grounded in the applicant’s actual participation.'
      )
    );
  }

  if (context.sportAssociation) {
    reasons.push(
      matchReason(
        'sportAssociation',
        context.sportAssociation,
        'The relevant sporting association or authority was retained as context where it was supplied by the applicant.'
      )
    );
  }

  return {
    id: `motivation-${context.applicationCaseId}`,
    decision: 'RECOMMENDED',
    confidence: context.sportDiscipline ? 'HIGH' : 'MEDIUM',
    source: 'RULE_ENGINE',
    title: context.sportDiscipline
      ? 'Recommended firearm motivation for the stated sport discipline'
      : 'Recommended firearm motivation',
    description: context.sportDiscipline
      ? 'A motivation document should be selected using the firearm, proposed lawful purpose, and the applicant’s specific sport discipline/category.'
      : 'A motivation document should be selected based on firearm details, licence section and intended use.',
    reasons,
    score: context.sportDiscipline ? 70 : 50,
    documentType: 'MOTIVATION',
    templateId: null,
  };
}


function buildFirearmInformationRecommendations(
  context: ApplicationIntelligenceContext
): FirearmInformationRecommendation[] {

  if (!context.firearm) return [];

  return [
    {
      id: `firearm-info-${context.applicationCaseId}`,
      decision: 'RECOMMENDED',
      confidence: 'MEDIUM',
      source: 'RULE_ENGINE',
      title: `${context.firearm.make} ${context.firearm.model ?? ''} information`,
      description:
        'Supporting firearm information should match calibre, manufacturer and firearm type.',
      reasons: [
        matchReason(
          'calibre',
          context.firearm.calibre,
          'Exact calibre matching required.'
        ),
      ],
      score: 50,
      documentType: 'SUPPORTING_RESEARCH',
      firearmMatch: calculateFirearmMatch(context),
    },
  ];
}


export async function analyseApplication(
  context: ApplicationIntelligenceContext
): Promise<ApplicationIntelligenceResult> {

  const motivation = buildMotivationRecommendation(context);

  const firearmInformation =
    buildFirearmInformationRecommendations(context);

  return {
    context,

    motivation,

    firearmInformation,

    documentSelection: {
      selectedDocuments: [],
      rejectedDocuments: [],
      recommendations: [
        ...(motivation ? [motivation] : []),
        ...firearmInformation,
      ],
    },

    warnings: [],

    generatedAt: new Date().toISOString(),
  };
}