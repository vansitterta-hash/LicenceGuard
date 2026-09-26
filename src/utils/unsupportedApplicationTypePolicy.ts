import type { ApplicationCaseType } from '../types/applicationCase';
export const UNSUPPORTED_APPLICATION_TYPE_MESSAGE = 'This application type is not yet supported in the current LicenceGuard beta.';
const unsupported = new Set<ApplicationCaseType>(['TEMPORARY_AUTHORISATION', 'APPEAL_OR_RECONSIDERATION']);
export const isApplicationTypeSupportedInBeta = (type: ApplicationCaseType) => !unsupported.has(type);
export function assertApplicationTypeSupportedInBeta(type: ApplicationCaseType): void { if (!isApplicationTypeSupportedInBeta(type)) throw new Error(UNSUPPORTED_APPLICATION_TYPE_MESSAGE); }