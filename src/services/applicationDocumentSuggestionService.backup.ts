import { REFERENCE_LIBRARY_ITEMS, type ReferenceLibraryItem } from '../data/referenceLibrary';
import { supabase } from '../lib/supabase';
import type { ApplicationCaseType } from '../types/applicationCase';
import type { FirearmType } from '../types/firearm';
import { addReferenceDocumentToClient } from './referenceLibraryService';

const db = supabase as any;

export type ApplicationDocumentSuggestion = {
  item: ReferenceLibraryItem;
  score: number;
  reason: string;
  kind: 'MOTIVATION' | 'FIREARM_INFORMATION';
};

type CaseContext = {
  caseId: string;
  applicationType: ApplicationCaseType;
  licenceSection: string | null;
  motivationSummary: string | null;
  client: {
    id: string;
    firstName: string;
    surname: string;
    idNumber: string;
    cellphone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    suburb: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
  };
  firearm: {
    id: string;
    make: string;
    model: string | null;
    calibre: string;
    serialNumber: string;
    firearmType: FirearmType;
  } | null;
};

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/\bcal(?:ibre|iber)?\b/g, ' ')
    .replace(/\bmm\b/g, ' mm ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string | null | undefined): string {
  return normalise(value).replace(/\s+/g, '');
}

const CALIBRE_FAMILIES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: '8x68s', aliases: ['8x68s', '8x68 s', '8x68mm', '8 x 68 s'] },
  { canonical: '222', aliases: ['.222', '222 rem', '222 remington'] },
  { canonical: '223', aliases: ['.223', '223 rem', '223 remington', '5.56', '556'] },
  { canonical: '22lr', aliases: ['.22 lr', '22lr', '22 long rifle'] },
  { canonical: '12gauge', aliases: ['12 ga', '12 gauge', '12 bore'] },
  { canonical: '20gauge', aliases: ['20 ga', '20ga', '20 gauge', '20 bore'] },
  { canonical: '410', aliases: ['.410', '410 bore', '410 shotgun'] },
  { canonical: '300blackout', aliases: ['300 aac', '.300 aac', '300 blackout', '.300 blackout', '300 blk'] },
  { canonical: '35remington', aliases: ['35 remington', '.35 remington'] },
  { canonical: '303british', aliases: ['303 british', '.303 british'] },
  { canonical: '308', aliases: ['.308', '308 win', '308 winchester'] },
  { canonical: '30-30', aliases: ['30 30', '30-30', '.30-30'] },
  { canonical: '6mmarc', aliases: ['6mm arc', '6 mm arc'] },
  { canonical: '9mm', aliases: ['9mm', '9 mm', '9x19', '9 x 19'] },
];

function calibreFamily(value: string): string {
  const source = normalise(value);
  const sourceCompact = compact(value);

  for (const family of CALIBRE_FAMILIES) {
    if (family.aliases.some((alias) => {
      const aliasNormal = normalise(alias);
      return source.includes(aliasNormal) || sourceCompact.includes(compact(alias));
    })) {
      return family.canonical;
    }
  }

  return sourceCompact;
}

function itemText(item: ReferenceLibraryItem): string {
  return normalise([
    item.title,
    item.fileName,
    item.applicationFolder,
    ...item.tags,
  ].join(' '));
}

function itemCalibreFamilies(item: ReferenceLibraryItem): Set<string> {
  const text = itemText(item);
  const result = new Set<string>();

  for (const family of CALIBRE_FAMILIES) {
    if (family.aliases.some((alias) => text.includes(normalise(alias)))) {
      result.add(family.canonical);
    }
  }

  return result;
}

function firearmTypeTerms(type: FirearmType): string[] {
  switch (type) {
    case 'SHOTGUN':
      return ['shotgun', 'side by side', 'pump action', 'semi auto shotgun'];
    case 'PISTOL':
      return ['pistol', 'handgun'];
    case 'REVOLVER':
      return ['revolver', 'handgun'];
    case 'SELF_LOADING_RIFLE':
    case 'HAND_MACHINE_CARBINE':
    case 'PISTOL_CALIBRE_CARBINE':
      return ['self loading', 'semi auto', 'rifle', 'carbine'];
    default:
      return ['rifle', 'carbine', 'bolt action', 'lever action', 'manual'];
  }
}

function applicationPurposeTerms(applicationType: ApplicationCaseType, licenceSection: string | null): string[] {
  const terms: string[] = [];
  if (applicationType.includes('RENEWAL')) terms.push('renewal');
  if (applicationType.includes('REAPPLICATION')) terms.push('reapplication');
  if (licenceSection === '13') terms.push('self defence', 'self-defense', 'section 13');
  if (licenceSection === '15') terms.push('occasional', 'section 15', 'hunting', 'sport');
  if (licenceSection === '16') terms.push('dedicated', 'section 16', 'hunting', 'sport');
  return terms;
}

function scoreItem(item: ReferenceLibraryItem, context: CaseContext, kind: ApplicationDocumentSuggestion['kind']): ApplicationDocumentSuggestion | null {
  if (!context.firearm) return null;

  const selectedFamily = calibreFamily(context.firearm.calibre);
  const listedFamilies = itemCalibreFamilies(item);
  const text = itemText(item);
  const titleOnly = normalise(`${item.title} ${item.fileName}`);
  const titleFamilies = new Set<string>();
  for (const family of CALIBRE_FAMILIES) {
    if (family.aliases.some((alias) => titleOnly.includes(normalise(alias)))) {
      titleFamilies.add(family.canonical);
    }
  }

  // The title and filename carry more weight than folder placement or tags.
  // An explicitly named conflicting calibre is always rejected, even when a
  // document was accidentally stored in or tagged for the selected calibre.
  if (titleFamilies.size > 0 && !titleFamilies.has(selectedFamily)) {
    return null;
  }
  if (listedFamilies.size > 0 && !listedFamilies.has(selectedFamily)) {
    return null;
  }

  const folderFamily = calibreFamily(item.applicationFolder);
  const exactCalibre = listedFamilies.has(selectedFamily) || folderFamily === selectedFamily;
  if (!exactCalibre) return null;

  let score = 50;
  const reasons = [`calibre matches ${context.firearm.calibre}`];
  const make = normalise(context.firearm.make);
  const model = normalise(context.firearm.model);

  if (make && text.includes(make)) {
    score += 18;
    reasons.push(`make matches ${context.firearm.make}`);
  }
  if (model && text.includes(model)) {
    score += 22;
    reasons.push(`model matches ${context.firearm.model}`);
  }

  const typeTerms = firearmTypeTerms(context.firearm.firearmType);
  if (typeTerms.some((term) => text.includes(normalise(term)))) {
    score += 12;
    reasons.push('firearm category matches');
  }

  const purposeTerms = applicationPurposeTerms(context.applicationType, context.licenceSection);
  if (purposeTerms.some((term) => text.includes(normalise(term)))) {
    score += 8;
    reasons.push('application purpose matches');
  }

  if (kind === 'MOTIVATION' && item.documentType !== 'MOTIVATION') return null;
  if (kind === 'FIREARM_INFORMATION' && !['SUPPORTING_RESEARCH', 'SUPPORTING_DOCUMENT'].includes(item.documentType)) return null;

  return { item, score, reason: reasons.join(' · '), kind };
}

export async function getApplicationDocumentContext(applicationCaseId: string): Promise<CaseContext> {
  const caseResult = await db
    .from('application_cases')
    .select('id,client_id,application_type,licence_section,motivation_summary,firearm_id')
    .eq('id', applicationCaseId)
    .single();

  if (caseResult.error) throw new Error(caseResult.error.message);

  const [clientResult, firearmResult] = await Promise.all([
    db.from('clients').select('*').eq('id', caseResult.data.client_id).single(),
    caseResult.data.firearm_id
      ? db.from('firearms').select('*').eq('id', caseResult.data.firearm_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clientResult.error) throw new Error(clientResult.error.message);
  if (firearmResult.error) throw new Error(firearmResult.error.message);

  return {
    caseId: caseResult.data.id,
    applicationType: caseResult.data.application_type,
    licenceSection: caseResult.data.licence_section,
    motivationSummary: caseResult.data.motivation_summary,
    client: {
      id: clientResult.data.id,
      firstName: clientResult.data.first_name,
      surname: clientResult.data.surname,
      idNumber: clientResult.data.id_number,
      cellphone: clientResult.data.cellphone,
      email: clientResult.data.email,
      addressLine1: clientResult.data.address_line_1,
      addressLine2: clientResult.data.address_line_2,
      suburb: clientResult.data.suburb,
      city: clientResult.data.city,
      province: clientResult.data.province,
      postalCode: clientResult.data.postal_code,
    },
    firearm: firearmResult.data ? {
      id: firearmResult.data.id,
      make: firearmResult.data.make,
      model: firearmResult.data.model,
      calibre: firearmResult.data.calibre,
      serialNumber: firearmResult.data.serial_number,
      firearmType: firearmResult.data.firearm_type,
    } : null,
  };
}

export async function suggestApplicationDocuments(applicationCaseId: string): Promise<{ context: CaseContext; suggestions: ApplicationDocumentSuggestion[] }> {
  const context = await getApplicationDocumentContext(applicationCaseId);
  if (!context.firearm) return { context, suggestions: [] };

  const motivations = REFERENCE_LIBRARY_ITEMS
    .map((item) => scoreItem(item, context, 'MOTIVATION'))
    .filter((item): item is ApplicationDocumentSuggestion => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const firearmInformation = REFERENCE_LIBRARY_ITEMS
    .map((item) => scoreItem(item, context, 'FIREARM_INFORMATION'))
    .filter((item): item is ApplicationDocumentSuggestion => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { context, suggestions: [...motivations, ...firearmInformation] };
}

export async function prepareSuggestedApplicationDocuments(input: {
  dealerId: string;
  userId: string;
  clientId: string;
  applicationCaseId: string;
  suggestions: ApplicationDocumentSuggestion[];
  context: CaseContext;
}): Promise<number> {
  const existingResult = await db
    .from('documents')
    .select('metadata')
    .eq('application_case_id', input.applicationCaseId);

  if (existingResult.error) throw new Error(existingResult.error.message);

  const existingIds = new Set<string>((existingResult.data ?? [])
    .map((row: any) => row.metadata?.referenceLibraryId)
    .filter(Boolean));

  let added = 0;
  for (const suggestion of input.suggestions) {
    if (existingIds.has(suggestion.item.id)) continue;

    await addReferenceDocumentToClient({
      dealerId: input.dealerId,
      userId: input.userId,
      clientId: input.clientId,
      applicationCaseId: input.applicationCaseId,
      item: suggestion.item,
      personalisation: {
        client: input.context.client,
        firearm: input.context.firearm,
        applicationType: input.context.applicationType,
        licenceSection: input.context.licenceSection,
        motivationSummary: input.context.motivationSummary,
        matchReason: suggestion.reason,
      },
    });
    added += 1;
  }

  return added;
}
