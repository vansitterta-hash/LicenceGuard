import { buildApplicationAutofillPackage } from './applicationAutofillService';
import {
  prepareSuggestedApplicationDocuments,
  suggestApplicationDocuments,
} from './applicationDocumentSuggestionService';
import {
  downloadGeneratedApplicationPack,
  generateAndArchiveApplicationPack,
  prepareApplicationPack,
} from './applicationPackService';
import {
  archiveOfficialApplicationPdf,
  createReviewValues,
} from './generatedApplicationDocumentService';

export type ApplicationOrchestrationStage =
  | 'MATCH_DOCUMENTS'
  | 'COMPLETE_SAPS_FORM'
  | 'PREPARE_PACK'
  | 'GENERATE_PACK';

export type ApplicationOrchestrationResult = {
  completedStages: ApplicationOrchestrationStage[];
  preparedDocumentCount: number;
  officialFormArchived: boolean;
  packGenerated: boolean;
  downloadedFileName: string | null;
  blockingReasons: string[];
};

export async function orchestrateApplicationPack(input: {
  dealerId: string;
  userId: string;
  clientId: string;
  applicationCaseId: string;
}): Promise<ApplicationOrchestrationResult> {
  const completedStages: ApplicationOrchestrationStage[] = [];
  let preparedDocumentCount = 0;
  let officialFormArchived = false;

  const suggestions = await suggestApplicationDocuments(input.applicationCaseId);
  if (suggestions.suggestions.length > 0) {
    preparedDocumentCount = await prepareSuggestedApplicationDocuments({
      dealerId: input.dealerId,
      userId: input.userId,
      clientId: input.clientId,
      applicationCaseId: input.applicationCaseId,
      suggestions: suggestions.suggestions,
      context: suggestions.context,
    });
  }
  completedStages.push('MATCH_DOCUMENTS');

  const autofill = await buildApplicationAutofillPackage(
    input.clientId,
    input.applicationCaseId
  );

  if (autofill.canGenerate) {
    await archiveOfficialApplicationPdf({
      dealerId: input.dealerId,
      clientId: input.clientId,
      userId: input.userId,
      data: autofill,
      values: createReviewValues(autofill),
    });
    officialFormArchived = true;
    completedStages.push('COMPLETE_SAPS_FORM');
  }

  const prepared = await prepareApplicationPack(
    input.dealerId,
    input.userId,
    input.clientId,
    input.applicationCaseId
  );
  completedStages.push('PREPARE_PACK');

  if (prepared.manifest.packState !== 'READY') {
    return {
      completedStages,
      preparedDocumentCount,
      officialFormArchived,
      packGenerated: false,
      downloadedFileName: null,
      blockingReasons: prepared.manifest.blockingReasons,
    };
  }

  const generated = await generateAndArchiveApplicationPack(input);
  completedStages.push('GENERATE_PACK');
  downloadGeneratedApplicationPack(generated.bytes, generated.fileName);

  return {
    completedStages,
    preparedDocumentCount,
    officialFormArchived,
    packGenerated: true,
    downloadedFileName: generated.fileName,
    blockingReasons: [],
  };
}
