import {
  analyseApplication,
} from './applicationIntelligenceService';

import type {
  ApplicationIntelligenceContext,
} from './types';

import type {
  ApplicationDocumentSuggestion,
} from '../services/applicationDocumentSuggestionService';


export async function getIntelligentDocumentSuggestions(
  context: ApplicationIntelligenceContext
): Promise<ApplicationDocumentSuggestion[]> {

  const result = await analyseApplication(context);

  const suggestions: ApplicationDocumentSuggestion[] = [];


  if (result.motivation) {
    suggestions.push({
      item: {
        id: result.motivation.id,
        title: result.motivation.title,
        fileName: '',
        applicationFolder: '',
        tags: [],
        documentType: 'MOTIVATION',
      } as any,

      score: result.motivation.score,

      reason:
        result.motivation.reasons
          .map((reason) => reason.explanation)
          .join(' · '),

      kind: 'MOTIVATION',
    });
  }


  for (const firearmInfo of result.firearmInformation) {
    suggestions.push({
      item: {
        id: firearmInfo.id,
        title: firearmInfo.title,
        fileName: '',
        applicationFolder: '',
        tags: [],
        documentType: firearmInfo.documentType,
      } as any,

      score: firearmInfo.score,

      reason:
        firearmInfo.reasons
          .map((reason) => reason.explanation)
          .join(' · '),

      kind: 'FIREARM_INFORMATION',
    });
  }


  return suggestions;
}