import JSZip from 'jszip';
import type { DocumentRecord } from '../types/document';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { applicationFormAnswers, saps271ComponentSerials } from '../utils/applicationFormAnswers';
import { CANONICAL_MOTIVATION_HASH, MOTIVATION_MAPPING_VERSION, stableMotivationJson } from '../utils/motivationGeneratedState';
import { COLLECTOR_CLAIM_SECTIONS, type MotivationSources, type MotivationReview, type MotivationResearchSource, type MotivationAnnexure } from '../types/motivation';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export function hasMotivationPlaceholder(text: string): boolean {
  return /\[(?:[^\]]*(?:REQUIR|CONFIRM|NOT RECORDED|PLACEHOLDER)[^\]]*)\]|_{3,}|\b(?:TODO|TBD|insert here|lorem ipsum)\b/i.test(text);
}
export const MASTER_ASSERTIONS: Record<string, { paragraph: number; label: string }> = {
  citizenship: { paragraph: 202, label: 'I am a South African citizen and the stated residential address is correct.' },
  training: { paragraph: 218, label: 'The prescribed training/testing statement and provider are accurate.' },
  safe: { paragraph: 234, label: 'I possess the prescribed SABS safe, bolted with Rawl bolts to the floor and wall as stated in the Master.' },
  criminal: { paragraph: 241, label: 'The Master’s no-criminal-record and no-disqualifying-offence statement is accurate.' },
  general: { paragraph: 401, label: 'I am not inclined to violence, am an SA citizen over 21, have never been convicted, and am not addicted to drugs or alcohol.' },
  wellbeing: { paragraph: 403, label: 'The Master’s mental stability, no violent/suicide tendencies, and never-harmed-self-or-others statement is accurate.' },
  peaceful: { paragraph: 405, label: 'The Master’s peaceful-person statement is accurate.' },
  testimonials: { paragraph: 409, label: 'I am willing to offer family/friend/colleague testimonials as stated.' },
};
const EVIDENCE_TYPES = new Set(['ID_COPY', 'COMPETENCY_CERTIFICATE', 'MEMBERSHIP_CERTIFICATE', 'DEDICATED_STATUS', 'GOOD_STANDING', 'ENDORSEMENT', 'SAFE_AFFIDAVIT', 'TESTIMONIAL', 'SUPPORTING_RESEARCH', 'SUPPORTING_DOCUMENT']);
function motivationApplicationAnswers(s: MotivationSources) {
  const answers = applicationFormAnswers(s.client.saps271_declarations, s.application.id);
  // A changed firearm link must not reuse the previous firearm's action/serial answers.
  return answers.saps271Firearm && answers.saps271Firearm.firearmId !== s.firearm.id ? { ...answers, saps271Firearm: undefined } : answers;
}
export function applicableMotivationEvidence(s: MotivationSources): DocumentRecord[] {
  const section = s.application.licence_section;
  return s.documents.filter(d => d.lifecycle_status === 'ACTIVE' && d.is_verified && d.storage_path && EVIDENCE_TYPES.has(d.document_type)
    && d.metadata?.category !== 'APPLICATION_PACK'
    && (!d.expiry_date || d.expiry_date >= new Date().toISOString().slice(0, 10))
    && ((d.document_type === 'ID_COPY' && d.client_id === s.client.id && d.dealer_id === s.client.dealer_id)
      || !d.application_case_id || d.application_case_id === s.application.id || (Array.isArray(d.metadata.applicationCaseIds) && d.metadata.applicationCaseIds.includes(s.application.id)))
    && (!d.firearm_id || d.firearm_id === s.firearm.id)
    && (!d.competency_id || d.competency_id === s.competency?.id)
    && (!d.firearm_licence_id || d.firearm_licence_id === s.application.firearm_licence_id)
    && (section === '16' || d.document_type !== 'DEDICATED_STATUS')
    && (['15', '16', '17'].includes(section ?? '') || !['MEMBERSHIP_CERTIFICATE', 'GOOD_STANDING', 'ENDORSEMENT'].includes(d.document_type)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function motivationResearchSources(s: MotivationSources): MotivationResearchSource[] {
  return s.documents.filter(d => d.lifecycle_status === 'ACTIVE' && d.document_type === 'SUPPORTING_RESEARCH'
    && d.firearm_id === s.firearm.id && d.application_case_id === s.application.id).filter(d => {
    const context = d.metadata.researchContext as { firearm?: Record<string, unknown>; purpose?: string; licenceSection?: string } | undefined;
    const fields: Record<string, unknown> = { make: s.firearm.make, model: s.firearm.model, calibre: s.firearm.calibre, firearmType: s.firearm.firearm_type };
    const same = (a: unknown, b: unknown) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    return !Object.keys(fields).some(key => context?.firearm?.[key] && fields[key] && !same(context.firearm[key], fields[key]))
      && (!context?.purpose || same(context.purpose, s.application.primary_purpose))
      && (!context?.licenceSection || same(context.licenceSection, s.application.licence_section));
  }).flatMap(d => {
    const context = d.metadata.researchContext as { sources?: any[] } | undefined;
    const raw = d.metadata.researchSources ?? context?.sources ?? (d.metadata.researchSource ? [{ ...d.metadata.researchSource as object, id: d.metadata.referenceLibraryId ?? d.id }] : []);
    return (Array.isArray(raw) ? raw : []).filter(r => typeof r.id === 'string' && typeof r.title === 'string' && typeof r.url === 'string')
      .map(r => ({ documentId: d.id, id: r.id, title: r.title, publisher: r.publisher ?? null, url: r.url, publishedDate: r.publishedDate ?? null, summary: r.summary ?? null }));
  });
}
export function defaultMotivationReview(s: MotivationSources): MotivationReview {
  const applicant = s.client.saps271_declarations?.saps517;
  const answers = motivationApplicationAnswers(s);
  const background = [applicant?.occupation?.trim() ? `Occupation: ${applicant.occupation}.` : '', applicant?.employmentStatus === 'EMPLOYED' && applicant.employerName?.trim() ? `Employer: ${applicant.employerName}.` : ''].filter(Boolean).join('\n');
  const membership = answers.associationMember === 'YES' ? [answers.associationName, answers.associationNumber ? `Membership number: ${answers.associationNumber}` : ''].filter(Boolean).join('; ') : '';
  return { background, narrative: s.application.motivation_summary ?? '', evidenceIds: applicableMotivationEvidence(s).slice(0, 26).map(d => d.id), claims: [], assertions: {},
    collector: { category: '', field: '', theme: '', subTheme: '', membership, approvalDocumentId: '', photographDocumentId: '', themeFit: '', points: '', regulation15: '', confirmed: false, legalReviewed: false } };
}

/** Read-only run grouping. Claim validation continues using all eligible sources,
 * so a rerun cannot rewrite or invalidate a reviewed historical claim by itself.
 */
export function motivationResearchRuns(s: MotivationSources) {
  const sources = motivationResearchSources(s);
  const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const runs = s.documents.filter(d => sources.some(source => source.documentId === d.id)).map(document => {
    const context = document.metadata.researchContext as { generatedAt?: string; discipline?: string; provider?: string; sources?: { retrievalDate?: string }[] } | undefined;
    const raw = document.metadata.researchSources ?? context?.sources ?? [];
    const retrieved = Array.isArray(raw) ? Math.max(0, ...raw.map(source => timestamp(source.retrievalDate))) : 0;
    const generated = timestamp(context?.generatedAt) || retrieved || timestamp(document.created_at);
    const discipline = context?.discipline?.trim().toLowerCase();
    const currentDiscipline = s.application.sport_discipline?.trim().toLowerCase();
    const matchesContext = !discipline || !currentDiscipline || currentDiscipline === discipline || currentDiscipline.includes(discipline);
    const live = document.metadata.source === 'EXTERNAL_RESEARCH_PROVIDER' || context?.provider === 'EXTERNAL_PROVIDER' || Array.isArray(document.metadata.researchSources);
    return { document, generatedAt: generated ? new Date(generated).toISOString() : null, generated, matchesContext, live, sources: sources.filter(source => source.documentId === document.id) };
  }).sort((a, b) => b.generated - a.generated || b.document.created_at.localeCompare(a.document.created_at) || b.document.id.localeCompare(a.document.id));
  const current = runs.find(run => run.live && run.matchesContext) ?? null;
  return { current, previous: runs.filter(run => run !== current) };
}
export function motivationAnnexures(s: MotivationSources, review: MotivationReview): MotivationAnnexure[] {
  const allowed = new Map(applicableMotivationEvidence(s).map(d => [d.id, d]));
  const ids = [...new Set(review.evidenceIds)].sort();
  if (ids.length > 26 || ids.some(id => !allowed.has(id))) throw new Error('Annexures must be actual applicable verified supporting files (maximum 26).');
  return ids.map((id, i) => ({ letter: String.fromCharCode(65 + i), document: allowed.get(id)! }));
}
export function reviewedMotivationClaims(s: MotivationSources, review: MotivationReview) {
  const sources = motivationResearchSources(s);
  return review.claims.filter(c => c.reviewed && c.text.trim()).map(c => {
    const source = sources.find(r => r.documentId === c.documentId && r.id === c.sourceId);
    if (!source || !source.url || c.text.length > 3000) throw new Error('Every reviewed claim needs an available application-specific Research source.');
    if (c.sourceSnapshot !== stableMotivationJson(source)) throw new Error('Research source details changed or were not captured during review. Review the original source again.');
    if (s.application.licence_section !== '17' && c.section !== 'Firearm relevance') throw new Error('Collector research cannot populate a non-Section-17 motivation.');
    if (c.section !== 'Firearm relevance' && !COLLECTOR_CLAIM_SECTIONS.includes(c.section as any)) throw new Error('Unsupported Research section.');
    return { ...c, source };
  });
}
export function motivationReleaseIssues(s: MotivationSources, r: MotivationReview): string[] {
  const issues: string[] = [];
  if (!['13', '15', '16', '17'].includes(s.application.licence_section ?? '')) issues.push('Select an applicable Section 13/15/16/17.');
  if (!s.application.primary_purpose?.trim()) issues.push('Save the actual application purpose.');
  if (['15', '16'].includes(s.application.licence_section ?? '') && /sport\s+shooting/i.test(s.application.primary_purpose ?? '') && !s.application.sport_discipline?.trim()) issues.push('Save the actual sport-shooting discipline.');
  if (s.application.licence_section === '17' && !/collect/i.test(s.application.primary_purpose ?? '')) issues.push('Confirm that the Section 17 purpose is private collection.');
  if (!r.background.trim()) issues.push('Confirm applicant background.');
  if (r.narrative.trim().split(/\s+/).length < 20 || hasMotivationPlaceholder(r.narrative)) issues.push('Provide a substantive personal motivation: actual participation/use, intended firearm use, suitability and relevant personal circumstances (at least 20 words; no placeholders).');
  if (hasMotivationPlaceholder(stableMotivationJson(r))) issues.push('Replace unresolved placeholder text in the Motivation review before release.');
  for (const [key, a] of Object.entries(MASTER_ASSERTIONS)) if (r.assertions[key] !== true) issues.push(`Applicant confirmation required: ${a.label}`);
  const profile = s.client.saps271_declarations;
  const answers = motivationApplicationAnswers(s);
  if (profile?.answers?.convictions?.answer !== 'NO' || profile?.answers?.unfitness?.answer !== 'NO') issues.push('Saved criminal-record/unfitness answers are unknown or conflict with the Master assertion.');
  if (profile?.saps517?.citizenshipChoice !== 'SA_CITIZEN') issues.push('Confirm SA citizenship in the existing profile.');
  const training = profile?.saps517?.accreditedTrainingCertificate;
  if (training?.answer !== 'YES' || !training.institution?.trim()) issues.push('Confirm the accredited training provider in the existing profile.');
  if (answers.prescribedSafe !== 'YES' || answers.safeMounted !== 'YES' || !answers.safeMountings?.includes('FLOOR') || !answers.safeMountings.includes('WALL')) issues.push('Saved safe details are unknown or conflict with the Master assertion.');
  if (!s.competency?.verified || !s.competency.certificate_number || (s.competency.expiry_date && s.competency.expiry_date < new Date().toISOString().slice(0, 10))) issues.push('A verified current competency is required.');
  if (!s.client.address_line_1 || !s.client.city) issues.push('Complete the stored residential address.');
  const serials = saps271ComponentSerials(answers.saps271Firearm, s.firearm.serial_number);
  if (!serials.component) issues.push('Confirm the stored serial component in the existing application answers.');
  if (s.application.licence_section === '17' && !answers.saps271Firearm?.action) issues.push('Confirm the firearm action before releasing a collector Motivation.');
  if (hasMotivationPlaceholder(stableMotivationJson({ client: { name: s.client.first_name, surname: s.client.surname, address: [s.client.address_line_1, s.client.address_line_2, s.client.suburb, s.client.city, s.client.province, s.client.postal_code] }, firearm: s.firearm, purpose: s.application.primary_purpose, discipline: s.application.sport_discipline, association: s.application.sport_association, competency: s.competency, training }))) issues.push('Correct placeholder text in the stored Motivation source fields.');
  const annexures = motivationAnnexures(s, r);
  if (s.application.licence_section === '16' && (!annexures.some(a => a.document.document_type === 'DEDICATED_STATUS') || !annexures.some(a => a.document.document_type === 'MEMBERSHIP_CERTIFICATE'))) issues.push('Select verified dedicated-status and membership evidence.');
  if (s.application.licence_section === '17') {
    const c = r.collector;
    if (!c.confirmed || !c.category || !c.field || !c.theme || !c.membership || !c.themeFit || !c.points) issues.push('Confirm collector category, approved field/theme, standing, theme fit, and specific points of interest.');
    if (!annexures.some(a => a.document.id === c.approvalDocumentId && ['ENDORSEMENT', 'SUPPORTING_DOCUMENT'].includes(a.document.document_type))) issues.push('Select verified independent association-issued specific-firearm approval.');
    if (!annexures.some(a => a.document.id === c.photographDocumentId)) issues.push('Select a verified actual-firearm photograph document.');
    if (!c.legalReviewed || !c.regulation15.trim()) issues.push('Confirm applicable Regulation 15/category/additional requirements against current independent guidance.');
  }
  reviewedMotivationClaims(s, r);
  return issues;
}
export function motivationSourceSnapshot(s: MotivationSources, r: MotivationReview): string {
  const { client: c, application: a, firearm: f, competency: k } = s;
  return stableMotivationJson({ master: CANONICAL_MOTIVATION_HASH, mapping: MOTIVATION_MAPPING_VERSION,
    client: { id: c.id, first_name: c.first_name, surname: c.surname, id_number: c.id_number, cellphone: c.cellphone, email: c.email, address: [c.address_line_1, c.address_line_2, c.suburb, c.city, c.province, c.postal_code], declarations: { answers: c.saps271_declarations?.answers, confirmedAt: c.saps271_declarations?.confirmedAt, applicant: c.saps271_declarations?.saps517, application: applicationFormAnswers(c.saps271_declarations, a.id) } },
    application: { id: a.id, client: a.client_id, firearm: a.firearm_id, competency: a.competency_id, licence: a.firearm_licence_id, type: a.application_type, section: a.licence_section, purpose: a.primary_purpose, discipline: a.sport_discipline, association: a.sport_association, summary: a.motivation_summary },
    firearm: { id: f.id, make: f.make, model: f.model, calibre: f.calibre, type: f.firearm_type, serial: f.serial_number, competency: f.required_competency },
    competency: k && { id: k.id, category: k.category, certificate: k.certificate_number, issued: k.issue_date, expires: k.expiry_date, verified: k.verified }, review: r,
    evidence: motivationAnnexures(s, r).map(({ letter, document: d }) => ({ letter, id: d.id, name: d.document_name, path: d.storage_path, checksum: d.checksum_sha256, version: d.version_number, verified: d.is_verified, expires: d.expiry_date, metadata: d.metadata })),
    research: s.documents.filter(d => d.lifecycle_status === 'ACTIVE' && d.document_type === 'SUPPORTING_RESEARCH' && d.application_case_id === a.id && d.firearm_id === f.id)
      .sort((left, right) => left.id.localeCompare(right.id)).map(d => ({ id: d.id, version: d.version_number, createdAt: d.created_at, metadata: d.metadata })),
    claims: reviewedMotivationClaims(s, r), releaseIssues: motivationReleaseIssues(s, r) });
}

/** Populate only numbered paragraphs/cells of the hash-locked working copy. No global replacement. */
export async function populateCanonicalMotivation(bytes: Uint8Array, s: MotivationSources, review: MotivationReview, date: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('Generate canonical Motivation on LicenceGuard Web over HTTPS or localhost.');
  const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource))).map(b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== CANONICAL_MOTIVATION_HASH) throw new Error('Canonical Master changed. Stop and review the mapping.');
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const p = Array.from(doc.getElementsByTagNameNS(W, 'p'));
  if (p.length !== 430 || p[266].textContent !== 'COLLECTOR-SPECIFIC MOTIVATION — SECTION 17 (CONDITIONAL)') throw new Error('Unexpected canonical paragraph structure.');
  const set = (index: number, text: string) => {
    const para = p[index];
    const run = doc.createElementNS(W, 'w:r');
    const properties = para.getElementsByTagNameNS(W, 'rPr')[0];
    if (properties) run.appendChild(properties.cloneNode(true));
    // Preserve paragraph properties, including styles, spacing and page breaks.
    for (const child of Array.from(para.childNodes)) if (!(child.nodeType === 1 && (child as Element).localName === 'pPr')) para.removeChild(child);
    text.split('\n').forEach((line, i) => {
      if (i) run.appendChild(doc.createElementNS(W, 'w:br'));
      const t = doc.createElementNS(W, 'w:t'); t.setAttribute('xml:space', 'preserve'); t.appendChild(doc.createTextNode(line)); run.appendChild(t);
    });
    para.appendChild(run);
  };
  const remove = (index: number) => p[index].parentNode?.removeChild(p[index]);
  const annexures = motivationAnnexures(s, review);
  const claims = reviewedMotivationClaims(s, review);
  const name = `${s.client.first_name} ${s.client.surname}`;
  const address = [...new Map([s.client.address_line_1, s.client.address_line_2, s.client.suburb, s.client.city, s.client.province, s.client.postal_code].filter((v): v is string => Boolean(v?.trim())).map(v => [v.trim().toLowerCase(), v.trim()])).values()].join(', ');
  const f = s.firearm, section = s.application.licence_section, purpose = s.application.primary_purpose || '[PURPOSE REQUIRES CONFIRMATION]';
  const answers = motivationApplicationAnswers(s);
  const serials = saps271ComponentSerials(answers.saps271Firearm, f.serial_number);
  const serialText = `${serials.component ?? '[COMPONENT REQUIRES CONFIRMATION]'} serial: ${f.serial_number}`;
  const firearmText = `Type: ${f.firearm_type.replaceAll('_', ' ')}; Make: ${f.make}${f.model?.trim() ? `; Model: ${f.model}` : ''}`;
  const refs = (type: string) => annexures.filter(a => a.document.document_type === type).map(a => `Annexure ${a.letter}`).join(', ');
  const claimText = (sectionName: string) => claims.filter(c => c.section === sectionName).map(c => `${c.text} [${c.source.title}; ${c.source.publisher ?? 'publisher not recorded'}; ${c.source.publishedDate ?? 'date not recorded'}; ${c.source.url}]`).join('\n');
  const values: Record<number, string> = { 4: `Name: ${name}`, 5: `Identity Number: ${s.client.id_number}`, 45: `Telephone: ${s.client.alternate_cellphone ?? ''}    Street address: ${s.client.address_line_1 ?? ''}`, 46: `Fax: ${s.client.saps271_declarations?.saps517?.faxNumber ?? ''}    Suburb: ${s.client.suburb ?? ''}`, 47: `Cell: ${s.client.cellphone ?? ''}    Town: ${s.client.city ?? ''}`, 48: `Enquiries: ${s.client.email ?? ''}    Code: ${s.client.postal_code ?? ''}`, 51: `Date: ${date}`, 57: `Name: ${name}    Identity number: ${s.client.id_number}`, 64: `Firearm type: ${f.firearm_type.replaceAll('_', ' ')}`, 65: `Make: ${f.make}${f.model?.trim() ? `; Model: ${f.model}` : ''}; Calibre: ${f.calibre}`, 66: serialText, 86: `Name: ${name}`, 185: `Name: ${name}    Identity number: ${s.client.id_number}`, 187: firearmText, 189: `${f.calibre}; ${serialText}`, 196: `Name: ${name}`, 198: `Identity number: ${s.client.id_number}`, 202: review.assertions.citizenship && s.client.saps271_declarations?.saps517?.citizenshipChoice === 'SA_CITIZEN' ? `I am a South African citizen and reside at ${address}.` : `[CITIZENSHIP REQUIRES CONFIRMATION] Residential address: ${address}`, 204: refs('ID_COPY') ? `Verified identity supporting document: ${refs('ID_COPY')}.` : 'No verified identity document selected as an annexure.', 211: `Section ${section ?? '[CONFIRM]'} Licence to possess a firearm for: ${purpose}`, 218: review.assertions.training && s.client.saps271_declarations?.saps517?.accreditedTrainingCertificate?.answer === 'YES' ? (p[218].textContent ?? '').replace('_______________________________________________________', s.client.saps271_declarations.saps517.accreditedTrainingCertificate.institution || '[PROVIDER REQUIRES CONFIRMATION]') : '[PRESCRIBED TRAINING AND PROVIDER REQUIRE CONFIRMATION]', 230: `I hereby apply in terms of Section ${section ?? '[CONFIRM]'} for: ${purpose}.${s.application.sport_discipline ? ` Discipline: ${s.application.sport_discipline}.` : ''}${s.application.sport_association ? ` Association: ${s.application.sport_association}.` : ''}\nCompetency: ${s.competency?.verified ? `${s.competency.category}, certificate ${s.competency.certificate_number ?? '[NOT RECORDED]'}` : '[VERIFIED COMPETENCY REQUIRED]'}.${refs('COMPETENCY_CERTIFICATE') ? ` ${refs('COMPETENCY_CERTIFICATE')}.` : ''}`, 238: review.background || '[APPLICANT BACKGROUND REQUIRES CONFIRMATION]', 247: firearmText, 248: `Calibre: ${f.calibre}`, 249: serialText, 259: `${f.firearm_type.replaceAll('_', ' ')} for ${purpose}.\n${s.application.sport_discipline ? `Discipline: ${s.application.sport_discipline}.\n` : ''}${s.application.sport_association ? `Association: ${s.application.sport_association}.\n` : ''}${review.narrative || '[PERSONAL MOTIVATION REQUIRES CONFIRMATION]'}${claimText('Firearm relevance') ? `\n${claimText('Firearm relevance')}` : ''}`, 261: firearmText, 262: `Calibre: ${f.calibre}`, 263: serialText, 381: 'Applicant review control: review the populated facts, declarations, evidence and sources before confirming and releasing this version.', 384: annexures.length ? annexures.map(a => `Annexure ${a.letter}: ${a.document.document_name}`).join('\n') : 'No verified supporting documents selected; no annexures represented as attached.', 425: `Date: ${date}`, 429: `Place: ${s.client.city ?? '[CONFIRM]'}` };
  for (const [key, assertion] of Object.entries(MASTER_ASSERTIONS)) if (key !== 'citizenship' && key !== 'training') {
    const conflict = key === 'criminal' && (s.client.saps271_declarations?.answers?.convictions?.answer !== 'NO' || s.client.saps271_declarations?.answers?.unfitness?.answer !== 'NO')
      || key === 'safe' && (answers.prescribedSafe !== 'YES' || answers.safeMounted !== 'YES' || !answers.safeMountings?.includes('FLOOR') || !answers.safeMountings?.includes('WALL'));
    if (review.assertions[key] !== true || conflict) values[assertion.paragraph] = `[APPLICANT CONFIRMATION REQUIRED: ${assertion.label}]`;
  }
  values[59] = (p[59].textContent ?? '').replace('LICENSES', 'LICENCES');
  values[183] = (p[183].textContent ?? '').replace('LICENSES', 'LICENCES');
  values[218] = values[218].replace('and has successfully', 'and have successfully');
  for (const [i, text] of Object.entries(values)) set(Number(i), text);
  // The Motivation renderer resolves index cells against actual section bookmarks.
  const sections = [[99, 194], [102, 207], [105, 214], [108, 236], [111, 239], [114, 243], [117, 257], ...(section === '17' ? [[120, 266], [123, 268], [126, 280], [129, 286], [132, 308], [135, 315], [138, 335], [141, 356], [144, 359]] : []), [150, 383], [147, 397]];
  // The Master places the register before the conclusion in the body; reflect
  // that actual order in the index without rearranging applicant content.
  const conclusionRow = p[147].parentNode?.parentNode;
  const registerRow = p[150].parentNode?.parentNode;
  if (conclusionRow && registerRow && conclusionRow.parentNode === registerRow.parentNode) registerRow.parentNode?.insertBefore(registerRow, conclusionRow);
  for (const [row, heading] of sections) {
    const key = `lg_motivation_${heading}`;
    const bookmark = doc.createElementNS(W, 'w:bookmarkStart');
    bookmark.setAttribute('w:id', String(1000 + heading)); bookmark.setAttribute('w:name', key);
    p[heading].appendChild(bookmark); set(row + 2, key);
  }
  let sectionNumber = 0;
  for (const [row] of sections) {
    if (![123, 126, 129, 132, 135, 138, 141, 144].includes(row)) sectionNumber++;
    set(row, row >= 123 && row <= 144 ? `${sectionNumber}.${(row - 120) / 3}` : String(sectionNumber));
  }
  const removeIndexRow = (index: number) => {
    let node: Node | null = p[index];
    while (node && !(node.nodeType === 1 && (node as Element).localName === 'tr')) node = node.parentNode;
    node?.parentNode?.removeChild(node);
  };
  removeIndexRow(153);
  // Internal controls stay in the UI. Only the real annexure register is printed.
  for (let i = 374; i <= 392; i++) if (![383, 384].includes(i)) remove(i);
  if (section !== '17') {
    const rows = new Set<Node>();
    for (let i = 120; i <= 146; i++) { let node: Node | null = p[i]; while (node && !(node.nodeType === 1 && (node as Element).localName === 'tr')) node = node.parentNode; if (node) rows.add(node); }
    rows.forEach(row => row.parentNode?.removeChild(row));
    const table = p[317].parentNode?.parentNode?.parentNode;
    if (table && (table as Element).localName === 'tbl') table.parentNode?.removeChild(table);
    for (let i = 266; i <= 373; i++) remove(i);
    [378, 386, 392].forEach(remove);
  } else {
    const c = review.collector;
    const field = (v: string) => c.confirmed && v.trim() ? v : '[REQUIRES CONFIRMATION]';
    set(270, `Collector classification/category: ${field(c.category)}`); set(271, `Approved field of interest: ${field(c.field)}`); set(272, `Approved collecting theme: ${field(c.theme)}`); set(273, `Approved sub-theme: ${c.confirmed ? c.subTheme || 'Not applicable (applicant confirmed)' : '[CONFIRM]'}`); set(274, `Collector membership/status: ${field(c.membership)}; ${refs('MEMBERSHIP_CERTIFICATE') || '[VERIFIED EVIDENCE REQUIRED]'}`);
    const approval = annexures.find(a => a.document.id === c.approvalDocumentId);
    set(276, `Independent association-issued approval: ${approval ? `Annexure ${approval.letter}` : '[REQUIRED — NOT SELF-CERTIFIED]'}`);
    set(277, `Approved field/theme fit: ${field(c.themeFit)}`); set(278, `Category/firearm compatibility: ${c.legalReviewed ? c.regulation15 : '[INDEPENDENT REQUIREMENTS REVIEW REQUIRED]'}`);
    set(281, `${firearmText}; Action: ${answers.saps271Firearm?.action ?? '[CONFIRM]'}; Calibre: ${f.calibre}`); set(282, `Barrel serial: ${serials.barrelSerial || 'Not recorded'}; Frame serial: ${serials.frameSerial || 'Not recorded'}; Receiver serial: ${serials.receiverSerial || 'Not recorded'}`);
    const photo = annexures.find(a => a.document.id === c.photographDocumentId); set(283, `Actual firearm photograph: ${photo ? `Annexure ${photo.letter}` : '[VERIFIED PHOTOGRAPH REQUIRED]'}`);
    const groups = [[288, 290], [291, 293], [294, 296], [297, 298], [299, 301], [302, 304], [305, 307]];
    groups.forEach(([start, end], index) => { const text = claimText(COLLECTOR_CLAIM_SECTIONS[index]); if (text) set(start + 1, text); else for (let i = start; i <= end; i++) remove(i); });
    set(309, field(c.themeFit)); set(312, `Specific points of interest: ${field(c.points)}`); set(313, `Overall relevance: ${field(c.themeFit)}`);
    const table = p[317].parentNode?.parentNode?.parentNode; if (table && (table as Element).localName === 'tbl') table.parentNode?.removeChild(table);
    set(316, 'No comparison firearms selected; no other firearm history is inferred.');
    set(337, c.legalReviewed && c.regulation15 ? c.regulation15 : '[APPLICABLE REGULATION 15 REQUIREMENTS REVIEW REQUIRED]');
    for (let i = 338; i <= 354; i++) remove(i);
    set(357, claims.length ? claims.map(c => `${c.source.title}; ${c.source.publisher ?? 'publisher not recorded'}; ${c.source.publishedDate ?? 'date not recorded'}; ${c.source.url}`).join('\n') : 'No reviewed external factual claims included.');
    [377, 385].forEach(remove);
  }
  if (section === '17') for (let i = 366; i <= 373; i++) remove(i);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
