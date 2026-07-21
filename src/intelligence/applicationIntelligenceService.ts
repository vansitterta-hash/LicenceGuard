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

  return {
    id: `motivation-${context.applicationCaseId}`,
    decision: 'RECOMMENDED',
    confidence: 'MEDIUM',
    source: 'RULE_ENGINE',
    title: 'Recommended firearm motivation',
    description:
      'A motivation document should be selected based on firearm details, licence section and intended use.',
    reasons,
    score: 50,
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