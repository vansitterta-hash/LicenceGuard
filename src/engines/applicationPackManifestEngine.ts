import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { ApplicationPackItem, ApplicationPackManifest } from '../types/documentEngine';
import type { DocumentType } from '../types/document';

function item(key: string, label: string, documentType: DocumentType, required: boolean, reason: string, generated = false): ApplicationPackItem {
  return { key, label, documentType, required, reason, generated };
}

export function buildApplicationPackManifest(data: ApplicationAutofillPackage): ApplicationPackManifest {
  const items: ApplicationPackItem[] = [
    item('APPLICATION_FORM', data.application.formLabel, data.application.formCode === 'SAPS_518_A' ? 'FIREARM_LICENCE_RENEWAL_FORM' : data.application.formCode === 'SAPS_517_G' ? 'COMPETENCY_RENEWAL_FORM' : data.application.formCode.startsWith('SAPS_517') ? 'COMPETENCY_APPLICATION' : 'FIREARM_LICENCE_APPLICATION_FORM', true, 'Primary statutory application form.', true),
    item('ID_COPY', 'Certified identity document copy', 'ID_COPY', true, 'Required applicant identification.'),
    item('PROOF_OF_ADDRESS', 'Proof of residential address', 'PROOF_OF_ADDRESS', true, 'Supports applicant residential particulars.'),
  ];

  if (data.firearm) {
    items.push(item('COMPETENCY_CERTIFICATE', 'Matching competency certificate', 'COMPETENCY_CERTIFICATE', true, 'Competency must match the firearm category.'));
    items.push(item('MOTIVATION', 'Application motivation', 'MOTIVATION', true, 'Explains the lawful need and intended use.'));
    items.push(item('SAFE_PHOTOS', 'Safe photographs', 'SUPPORTING_DOCUMENT', true, 'Photographs showing the firearm safe.'));
    items.push(item('SAFE_SECURING_PHOTOS', 'Safe securing/anchoring photographs', 'SUPPORTING_DOCUMENT', true, 'Photographs showing how the safe is secured.'));
  }

  if (data.supplier?.acquisitionSource === 'DEALER') {
    items.push(item('ACQUISITION_EVIDENCE', 'Dealer acquisition evidence', 'PURCHASE_INVOICE', true, 'Dealer invoice, sale document, SAP 350 or equivalent associated with this firearm.'));
  }

  if (data.supplier?.acquisitionSource === 'PRIVATE_SELLER') {
    items.push(item('ACQUISITION_EVIDENCE', 'Private-sale acquisition evidence', 'PURCHASE_INVOICE', true, 'Signed sale agreement or equivalent evidence associated with this firearm and seller.'));
  }

  const section = data.firearm?.licenceSection.replace(/\D/g, '') ?? '';
  if (section === '16') {
    items.push(item('DEDICATED_STATUS', 'Dedicated status certificate', 'DEDICATED_STATUS', true, 'Section 16 application requirement.'));
    items.push(item('GOOD_STANDING', 'Good-standing letter', 'GOOD_STANDING', true, 'Confirms current standing with the accredited association.'));
    items.push(item('MEMBERSHIP_CERTIFICATE', 'Membership certificate', 'MEMBERSHIP_CERTIFICATE', true, 'Supports dedicated status and association membership.'));
    items.push(item('ENDORSEMENT', 'Firearm-specific endorsement', 'ENDORSEMENT', true, 'Supports suitability for the intended dedicated activity.'));
    items.push(item('SUPPORTING_RESEARCH', 'Firearm / calibre supporting research', 'SUPPORTING_RESEARCH', false, 'Optional material strengthening the motivation.'));
  }

  return {
    applicationType: data.application.applicationType,
    templateCode: data.application.formCode,
    items,
    requiredCount: items.filter((entry) => entry.required).length,
    generatedCount: items.filter((entry) => entry.generated).length,
  };
}
