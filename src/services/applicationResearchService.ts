import { REFERENCE_LIBRARY_ITEMS, type ReferenceLibraryItem } from '../data/referenceLibrary';
import { supabase } from '../lib/supabase';
import { generatedDocumentPrivacy, registerGeneratedDocument } from './generatedApplicationDocumentService';
import type { ApplicationResearchContext, ResearchSource, ResearchSubjectType } from '../types/research';

export async function requestLiveApplicationResearch(input: {
  applicationType: string;
  licenceSection: string | null;
  purpose: string | null;
  discipline: string | null;
  association: string | null;
  firearm: { make: string | null; model: string | null; calibre: string | null; firearmType: string | null };
}): Promise<ApplicationResearchContext> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sign in again before requesting live application research.');
  }

  const response = await fetch('/api/application-research', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const result = await response.json() as ApplicationResearchContext & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Live application research is unavailable.');
  return result;
}

function pdfText(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '?');
}

function splitPdfText(value: string, maximumLength = 88): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > maximumLength) {
      if (line) lines.push(line);
      line = '';
      for (let index = 0; index < word.length; index += maximumLength) {
        lines.push(word.slice(index, index + maximumLength));
      }
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > maximumLength) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function archiveLiveApplicationResearch(input: {
  dealerId: string;
  userId: string;
  clientId: string;
  applicationCaseId: string;
  firearmId: string;
  context: ApplicationResearchContext;
}): Promise<void> {
  const privacy = generatedDocumentPrivacy(input.userId);
  const externalSources = input.context.sources.filter((source) => source.sourceKind === 'EXTERNAL_PROVIDER');
  if (externalSources.length === 0) throw new Error('The live provider returned no source results to archive.');

  const { PDFDocument, StandardFonts } = await import('pdf-lib/cjs/index.js');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const draw = (_label: string, value: unknown, isBold = false) => {
    const font = isBold ? bold : regular;
    for (const line of splitPdfText(pdfText(value), 88)) {
      if (y < 54) return;
      page.drawText(line, { x: 44, y, size: isBold ? 13 : 9, font, maxWidth: 505 });
      y -= isBold ? 20 : 13;
    }
    if (_label) y -= 4;
  };

  draw('', 'LIVE APPLICATION RESEARCH - SOURCE REVIEW REQUIRED', true);
  draw('', `Generated: ${input.context.generatedAt}`);
  draw('', `Application: ${input.context.applicationType ?? 'Not recorded'} | Licence section: ${input.context.licenceSection ?? 'Not recorded'}`);
  draw('', `Applicant-stated purpose: ${input.context.purpose ?? 'Not recorded'}`);
  draw('', `Discipline: ${input.context.discipline ?? 'Not recorded'} | Association: ${input.context.association ?? 'Not recorded'}`);
  draw('', `Firearm: ${input.context.firearm?.make ?? ''} ${input.context.firearm?.model ?? ''} | Calibre: ${input.context.firearm?.calibre ?? 'Not recorded'}`);
  draw('', 'Search snippets are unverified discovery leads, not legal advice or applicant-specific proof. Inspect original pages before use.');
  y -= 10;

  for (const [index, source] of externalSources.entries()) {
    if (y < 390) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
      draw('', 'LIVE APPLICATION RESEARCH - CONTINUED', true);
    }
    draw('', `${index + 1}. ${source.title}`, true);
    draw('', `Publisher: ${source.publisher ?? 'Not identified'} | Retrieved: ${source.retrievalDate ?? 'Not recorded'}`);
    draw('', `Published/updated: ${source.publishedDate ?? 'Not identified'} | Review status: ${source.trustLevel}`);
    draw('', `URL: ${source.url ?? 'Not available'}`);
    draw('', source.summary ?? 'No source excerpt supplied.');
    y -= 10;
  }

  const bytes = await pdf.save();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `LIVE_RESEARCH_${timestamp}.pdf`;
  const storagePath = `${input.dealerId}/${input.clientId}/SUPPORTING_RESEARCH/${fileName}`;
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const upload = await (supabase as any).storage.from('licenceguard-documents').upload(storagePath, blob, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  await registerGeneratedDocument({
    ...privacy,
    dealer_id: input.dealerId,
    client_id: input.clientId,
    competency_id: null,
    firearm_id: input.firearmId,
    firearm_licence_id: null,
    application_case_id: input.applicationCaseId,
    parent_document_id: null,
    document_type: 'SUPPORTING_RESEARCH',
    document_scope: 'APPLICATION_CASE',
    lifecycle_status: 'ACTIVE',
    document_name: 'Live firearm, calibre and discipline research (unreviewed sources)',
    document_date: new Date().toISOString().slice(0, 10),
    expiry_date: null,
    issued_by: 'LicenceGuard Research Provider',
    reference_number: null,
    version_number: 1,
    storage_path: storagePath,
    file_name: fileName,
    original_file_name: fileName,
    mime_type: 'application/pdf',
    file_size_bytes: blob.size,
    is_verified: false,
    is_generated: true,
    generated_from_template_id: null,
    notes: 'Live search excerpts and source URLs. Review the original publications and independently confirm every claim before relying on this document.',
    metadata: {
      source: 'EXTERNAL_RESEARCH_PROVIDER',
      provider: input.context.provider,
      researchContext: input.context,
      researchSources: externalSources,
      trustLevel: 'UNREVIEWED',
    },
    uploaded_by: input.userId,
  });
}

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDisciplineSeed(input: string | null | undefined): string | null {
  const text = normalise(input ?? '');
  if (!text) return null;

  const disciplineSignals = [
    'trap',
    'skeet',
    'sporting clay',
    'clay target',
    'field shooting',
    'practical',
    'benchrest',
    'silhouette',
    'pistol',
    'rifle',
    'hunting',
    'target shooting',
  ];

  const match = disciplineSignals.find((signal) => text.includes(normalise(signal)));
  return match ?? (text.length > 0 ? text : null);
}

const CALIBRE_ALIASES: Array<{ family: string; aliases: string[] }> = [
  { family: '12gauge', aliases: ['12 ga', '12 gauge', '12 bore'] },
  { family: '20gauge', aliases: ['20 ga', '20 gauge', '20 bore'] },
  { family: '410', aliases: ['.410', '410 bore', '410 shotgun'] },
  { family: '22lr', aliases: ['.22 lr', '22lr', '22 long rifle'] },
  { family: '300blackout', aliases: ['300 aac', '.300 aac', '300 blackout', '.300 blackout', '300 blk'] },
  { family: '223', aliases: ['.223', '223 remington', '5.56', '556'] },
  { family: '308', aliases: ['.308', '308 winchester'] },
  { family: '6mmarc', aliases: ['6mm arc', '6 mm arc'] },
  { family: '8x68s', aliases: ['8x68s', '8 x 68 s'] },
  { family: '35remington', aliases: ['35 remington', '.35 remington'] },
];

function calibreFamily(value: string | null | undefined): string | null {
  const valueNormalised = normalise(value);
  const valueCompact = valueNormalised.replaceAll(' ', '');
  for (const entry of CALIBRE_ALIASES) {
    if (entry.aliases.some((alias) => {
      const aliasNormalised = normalise(alias);
      return valueNormalised.includes(aliasNormalised)
        || valueCompact.includes(aliasNormalised.replaceAll(' ', ''));
    })) return entry.family;
  }
  return valueNormalised ? valueCompact : null;
}

function itemCalibreFamilies(item: ReferenceLibraryItem): Set<string> {
  const text = normalise([
    item.title,
    item.fileName,
    item.applicationFolder,
    ...item.tags,
  ].join(' '));
  const found = new Set<string>();
  for (const entry of CALIBRE_ALIASES) {
    if (entry.aliases.some((alias) => text.includes(normalise(alias)))) found.add(entry.family);
  }
  return found;
}

function referenceUrl(item: ReferenceLibraryItem): string {
  if (item.sourceUrl) return item.sourceUrl;
  return `/${item.relativePath.replace(/^\/?(?:reference-library\/)?/i, '').split('/').map(encodeURIComponent).join('/')}`;
}

function toResearchSource(item: ReferenceLibraryItem, matchingCalibre: string | null): ResearchSource {
  const discipline = item.discipline ?? null;

  return {
    id: item.id,
    title: item.sourceTitle ?? item.title,
    publisher: item.sourcePublisher ?? null,
    url: referenceUrl(item),
    retrievalDate: item.retrievalDate ?? null,
    trustLevel: item.trustLevel ?? 'UNREVIEWED',
    subjectType: (item.title.toLowerCase().includes('ballistic') ? 'BALLISTIC'
      : item.category.toLowerCase().includes('calibre') ? 'CALIBRE'
        : discipline ? 'DISCIPLINE' : 'GENERAL') as ResearchSubjectType,
    summary: item.summary ?? null,
    applicability: item.applicability
      ?? (matchingCalibre ? `Reference-library tags match calibre ${matchingCalibre}; firearm-specific suitability has not been independently verified.` : null),
    category: item.category ?? null,
    association: item.association ?? null,
    discipline: discipline,
    firearmMake: null,
    firearmModel: null,
    calibre: matchingCalibre,
    sourceKind: 'REFERENCE_LIBRARY',
  };
}

export function buildApplicationResearchContext(input: {
  applicationType: string;
  licenceSection: string | null;
  motivationSummary: string | null;
  firearm: { make: string | null; model: string | null; calibre: string | null; firearmType: string | null } | null;
  sportDiscipline?: string | null;
  sportAssociation?: string | null;
}): ApplicationResearchContext {
  const discipline = getDisciplineSeed(input.sportDiscipline ?? input.motivationSummary);
  const association = input.sportAssociation ?? null;
  const requestedFamily = calibreFamily(input.firearm?.calibre);
  const disciplineTerm = normalise(discipline);
  const matchingItems = REFERENCE_LIBRARY_ITEMS
    .filter((item) => item.documentType === 'SUPPORTING_RESEARCH')
    .map((item) => {
      const itemFamilies = itemCalibreFamilies(item);
      const calibreMatched = Boolean(requestedFamily && itemFamilies.has(requestedFamily));
      const itemDiscipline = normalise(item.discipline);
      const itemText = normalise([item.title, item.fileName, item.applicationFolder, ...item.tags].join(' '));
      const disciplineMatched = Boolean(disciplineTerm && (
        itemDiscipline === disciplineTerm || itemText.includes(disciplineTerm)
      ));
      const calibreConflict = Boolean(requestedFamily && itemFamilies.size && !calibreMatched);
      return { item, calibreMatched, disciplineMatched, calibreConflict };
    })
    .filter(({ calibreMatched, disciplineMatched, calibreConflict }) => !calibreConflict && (calibreMatched || disciplineMatched))
    .sort((left, right) => Number(right.disciplineMatched) - Number(left.disciplineMatched))
    .slice(0, 6);

  const sources = matchingItems.map(({ item }) => toResearchSource(item, input.firearm?.calibre ?? null));
  const findings = sources.flatMap((source) => source.summary ? [{
    subject: source.discipline ?? source.category ?? 'Research',
    summary: source.summary,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceUrl: source.url,
  }] : []);

  const warnings: string[] = [];
  if (sources.length === 0) {
    warnings.push('No matching local research was found for the firearm/calibre and stated purpose. External research remains required before this can be treated as a verified fact.');
  } else {
    warnings.push('Matched documents are local archive references, not live internet research. Verify source claims and applicant-specific relevance before relying on them.');
  }

  return {
    provider: 'LOCAL_REFERENCE_LIBRARY',
    providerStatus: sources.length > 0 ? 'PARTIAL' : 'REQUIRES_EXTERNAL_PROVIDER',
    applicationType: input.applicationType,
    licenceSection: input.licenceSection,
    purpose: input.motivationSummary,
    discipline,
    association,
    firearm: input.firearm,
    sourceCount: sources.length,
    sources,
    findings,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export function researchProviderStatusSummary(context: ApplicationResearchContext): string {
  if (context.providerStatus === 'REQUIRES_EXTERNAL_PROVIDER') {
    return 'External research provider required for this application context.';
  }

  return 'Local archive references matched; live research and source-claim verification are not available.';
}
