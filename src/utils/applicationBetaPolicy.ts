import type { ApplicationCaseType } from '../types/applicationCase';
import type { AutofillFormCode } from '../types/applicationAutofill';

export function getAutofillFormCode(type: ApplicationCaseType): AutofillFormCode {
  switch (type) {
    case 'COMPETENCY_FIRST_APPLICATION':
    case 'COMPETENCY_REAPPLICATION': return 'SAPS_517';
    case 'COMPETENCY_ADDITIONAL_CATEGORY': return 'SAPS_517_A';
    case 'COMPETENCY_RENEWAL': return 'SAPS_517_G';
    case 'FIREARM_LICENCE_FIRST_APPLICATION':
    case 'FIREARM_LICENCE_ADDITIONAL_APPLICATION': return 'SAPS_271';
    case 'FIREARM_LICENCE_RENEWAL':
    case 'FIREARM_LICENCE_REAPPLICATION': return 'SAPS_518_A';
    default: throw new Error(`No SAPS form mapping is available for ${type}.`);
  }
}