import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Button from '../Button';
import Card from '../Card';
import TextField from '../TextField';
import { Colors } from '../../theme/colors';
import { userAlert as Alert } from '../../utils/userAlert';
import { openExternalDocument } from '../../utils/openExternalDocument';
import { createDocumentSignedUrl } from '../../services/documentService';
import { assertCurrentMotivationReleased, confirmMotivation, generateMotivation, getMotivationWorkspace, markMotivationReviewed, saveMotivationCorrections, type MotivationIdentity } from '../../services/motivationService';
import { applicableMotivationEvidence, MASTER_ASSERTIONS, motivationResearchSources, motivationResearchRuns } from '../../engines/canonicalMotivationEngine';
import { stableMotivationJson } from '../../utils/motivationGeneratedState';
import { COLLECTOR_CLAIM_SECTIONS, type MotivationReview } from '../../types/motivation';

type Props = { identity: MotivationIdentity; onChanged: () => Promise<void> };
export default function MotivationReviewPanel({ identity, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<Awaited<ReturnType<typeof getMotivationWorkspace>> | null>(null);
  const [review, setReview] = useState<MotivationReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const load = useCallback(async () => {
    try { const w = await getMotivationWorkspace(identity); setWorkspace(w); setReview(w.review); setError(null); setRead(false); setConfirmAccurate(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load Motivation.'); }
  }, [identity.applicationCaseId, identity.clientId, identity.dealerId, identity.userId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (action: () => Promise<unknown>, reload = true) => {
    setBusy(true);
    try { await action(); if (reload) { await load(); await onChanged(); } }
    catch (e) { Alert.alert('Motivation', e instanceof Error ? e.message : 'Unable to complete Motivation action.'); }
    finally { setBusy(false); }
  };
  const update = (patch: Partial<MotivationReview>) => { setReview(r => r && ({ ...r, ...patch })); setRead(false); setConfirmAccurate(false); };
  const textStyle = { color: Colors.text, marginBottom: 8 };
  if (!workspace || !review) return <Card title="Canonical Motivation"><Text style={textStyle}>{error ?? 'Loading application Motivation…'}</Text><Button title="Reload" onPress={() => void load()} /></Card>;
  const dirty = stableMotivationJson(review) !== stableMotivationJson(workspace.review);
  const evidence = applicableMotivationEvidence(workspace.sources);
  const research = motivationResearchSources(workspace.sources);
  const runs = motivationResearchRuns(workspace.sources);
  const currentSources = runs.current?.sources ?? [];
  const previousSources = runs.previous.flatMap(run => run.sources);
  const eligibleClaims = review.claims.filter(c => c.reviewed && c.text.trim() && research.some(s => s.documentId === c.documentId && s.id === c.sourceId && c.sourceSnapshot === stableMotivationJson(s)));
  const researchDocuments = workspace.sources.documents.filter(d => d.document_type === 'SUPPORTING_RESEARCH');
  const excludedResearch = researchDocuments.filter(d => !research.some(s => s.documentId === d.id));
  const unavailableClaims = review.claims.filter(c => !research.some(s => s.documentId === c.documentId && s.id === c.sourceId));
  const collector = workspace.sources.application.licence_section === '17';
  const preview = async (document = workspace.current, kind: 'current' | 'history' | 'supporting' = 'current') => {
    if (!document) return;
    if (kind === 'supporting' && !evidence.some(d => d.id === document.id && d.storage_path === document.storage_path)) throw new Error('Reload the authorized supporting evidence before reviewing this file.');
    if (kind === 'current') {
      const fresh = await getMotivationWorkspace(identity);
      if (dirty || fresh.current?.id !== document.id || fresh.state === 'OUTDATED') throw new Error('This Motivation is outdated. Regenerate V2 before previewing the current document; earlier artifacts remain in version history.');
    }
    await openExternalDocument(() => createDocumentSignedUrl(document.storage_path), { originatingRoute: 'ApplicationReadiness', applicationCaseId: identity.applicationCaseId, clientId: identity.clientId, workflowStep: 'motivation-review' });
    if (kind === 'current' && document.id === workspace.current?.id && !dirty && workspace.state !== 'OUTDATED') { await markMotivationReviewed(identity, document.id); setRead(true); }
  };
  return <Card title="Canonical Motivation" subtitle="Generate, review, correct and confirm this application’s Motivation before release.">
    <Text style={textStyle}>Current version: {workspace.current?.version_number ?? 'Not generated'} · {dirty ? 'Corrections require regeneration' : workspace.state}</Text>
    <TextField editable={!busy} label="Applicant background (confirm personal facts)" multiline value={review.background} maxLength={6000} onChangeText={background => update({ background })} />
    <TextField editable={!busy} label="Application-specific motivation / lawful need" multiline value={review.narrative} maxLength={12000} onChangeText={narrative => update({ narrative })} />
    <Text style={textStyle}>Describe your actual participation or use, how you intend to use this firearm, why it suits that purpose, and your relevant personal circumstances. The saved application summary supplies an initial draft only. Provide substantive applicant-specific facts (at least 20 words); a purpose label alone cannot be released. Research cannot supply your personal history.</Text>
    <Text style={textStyle}>Confirm each statement only if true. Unknown or conflicting answers block release; correct stored details through the existing profile/application screens.</Text>
    {Object.entries(MASTER_ASSERTIONS).map(([key, a]) => <Button key={key} disabled={busy} variant="secondary" title={`${review.assertions[key] ? '✓ ' : 'Confirm: '}${a.label}`} onPress={() => update({ assertions: { ...review.assertions, [key]: !review.assertions[key] } })} />)}
    <Text style={textStyle}>Verified annexures — select only evidence applicable to this application.</Text>
    {evidence.map(d => <View key={d.id}><Button disabled={busy} variant="secondary" title={`${review.evidenceIds.includes(d.id) ? '✓ ' : ''}${d.document_name}`} onPress={() => update({ evidenceIds: review.evidenceIds.includes(d.id) ? review.evidenceIds.filter(id => id !== d.id) : [...review.evidenceIds, d.id] })} /><Button disabled={busy} title="Review supporting file" variant="ghost" onPress={() => void run(() => preview(d, 'supporting'), false)} /></View>)}
    {review.evidenceIds.some(id => !evidence.some(d => d.id === id)) && <Button disabled={busy} title="Remove unavailable or no-longer-verified annexures" onPress={() => update({ evidenceIds: review.evidenceIds.filter(id => evidence.some(d => d.id === id)) })} />}
    <Text style={textStyle}>Research claims — inspect the original source, correct the claim, then explicitly mark it reviewed. Unreviewed results are omitted.</Text>
    <Text style={textStyle}>Available source publications: {research.length}. Reviewed source-backed claims eligible for inclusion: {eligibleClaims.length}. Sources requiring claim review: {research.filter(s => !eligibleClaims.some(c => c.documentId === s.documentId && c.sourceId === s.id)).length}. Excluded/unavailable Research documents: {excludedResearch.length}. Unavailable saved claims: {unavailableClaims.length}.</Text>
    {research.length === 0 && <Text style={textStyle}>No eligible source publications are available for this firearm and application. Use the existing application Research workflow, review its sources, then reload here. Research PDFs or summaries alone are not confirmed claims.</Text>}
    {excludedResearch.map(d => <Text key={d.id} style={textStyle}>Excluded Research: {d.document_name} — inactive, different application/firearm context, or missing usable source metadata. It is not included in the Motivation.</Text>)}
    {review.claims.some(c => !research.some(s => s.documentId === c.documentId && s.id === c.sourceId)) && <Button disabled={busy} title="Remove claims whose Research sources are no longer available" onPress={() => update({ claims: review.claims.filter(c => research.some(s => s.documentId === c.documentId && s.id === c.sourceId)) })} />}
    <Text style={textStyle}>Current Research — latest successful run: {runs.current?.generatedAt ?? 'No dated current run'}. Source publications: {currentSources.length}. New sources require explicit claim review; earlier approvals are not transferred.</Text>
    {[...currentSources, ...previousSources].map((source, index) => {
      const claim = review.claims.find(c => c.documentId === source.documentId && c.sourceId === source.id);
      const sourceSnapshot = stableMotivationJson(source);
      const claimReviewed = claim?.reviewed && claim.sourceSnapshot === sourceSnapshot;
      const change = (patch: Partial<NonNullable<typeof claim>>) => update({ claims: [...review.claims.filter(c => !(c.documentId === source.documentId && c.sourceId === source.id)), { documentId: source.documentId, sourceId: source.id, text: claim?.text ?? source.summary ?? '', section: claim?.section ?? 'Firearm relevance', reviewed: claim?.reviewed ?? false, ...patch }] });
      return <View key={`${source.documentId}:${source.id}`}>
        {index === currentSources.length && previousSources.length > 0 && <Text style={textStyle}>Previous Research / Research history — retained separately from Current Research. Existing reviewed claims keep their original provenance and review state.</Text>}
        <Text style={textStyle}>{source.documentId === runs.current?.document.id ? 'Current Research' : 'Previous Research'} · Run: {([runs.current, ...runs.previous].find(run => run?.document.id === source.documentId))?.generatedAt ?? 'Date unavailable'}</Text>
        <Text style={textStyle}>{source.title} — {claimReviewed && claim?.text.trim() ? 'Reviewed claim eligible for inclusion' : 'Claim requires review; excluded until reviewed'}</Text>
        <Button title="Open original Research source" disabled={busy} variant="ghost" onPress={() => void run(() => openExternalDocument(() => source.url!, { originatingRoute: 'ApplicationReadiness', workflowStep: 'motivation-research' }), false)} />
        <TextField editable={!busy} label="Supported claim" multiline maxLength={3000} value={claim?.text ?? source.summary ?? ''} onChangeText={text => change({ text, reviewed: false })} />
        {collector && <View>{['Firearm relevance', ...COLLECTOR_CLAIM_SECTIONS].map(section => <Button key={section} disabled={busy} variant="ghost" title={`${(claim?.section ?? 'Firearm relevance') === section ? '✓ ' : ''}${section}`} onPress={() => change({ section })} />)}</View>}
        <Button disabled={busy} variant="secondary" title={`${claimReviewed ? '✓ ' : ''}I reviewed the original source and this claim’s firearm/applicant relevance`} onPress={() => change({ reviewed: !claimReviewed, sourceSnapshot })} />
      </View>;
    })}
    {collector && <View>
      {(['category', 'field', 'theme', 'subTheme', 'membership', 'themeFit', 'points', 'regulation15'] as const).map(key => <TextField key={key} editable={!busy} label={`Collector ${key}`} multiline maxLength={6000} value={review.collector[key]} onChangeText={value => update({ collector: { ...review.collector, [key]: value, confirmed: false, legalReviewed: false } })} />)}
      <Text style={textStyle}>Independent association-issued specific-firearm approval (LicenceGuard does not certify approval):</Text>
      {evidence.filter(d => review.evidenceIds.includes(d.id) && ['ENDORSEMENT', 'SUPPORTING_DOCUMENT'].includes(d.document_type)).map(d => <Button key={d.id} disabled={busy} variant="secondary" title={`${review.collector.approvalDocumentId === d.id ? '✓ ' : ''}${d.document_name}`} onPress={() => update({ collector: { ...review.collector, approvalDocumentId: d.id, confirmed: false } })} />)}
      <Text style={textStyle}>Actual firearm photograph:</Text>
      {evidence.filter(d => review.evidenceIds.includes(d.id)).map(d => <Button key={d.id} disabled={busy} variant="ghost" title={`${review.collector.photographDocumentId === d.id ? '✓ ' : ''}${d.document_name}`} onPress={() => update({ collector: { ...review.collector, photographDocumentId: d.id, confirmed: false } })} />)}
      <Button disabled={busy} variant="secondary" title={`${review.collector.confirmed ? '✓ ' : ''}I confirmed collector particulars against the selected independent evidence`} onPress={() => update({ collector: { ...review.collector, confirmed: !review.collector.confirmed } })} />
      <Button disabled={busy} variant="secondary" title={`${review.collector.legalReviewed ? '✓ ' : ''}Applicable Regulation 15/category/additional requirements reviewed independently`} onPress={() => update({ collector: { ...review.collector, legalReviewed: !review.collector.legalReviewed } })} />
    </View>}
    {workspace.issues.length > 0 && <Text style={textStyle}>Release holds:{'\n'}{workspace.issues.join('\n')}</Text>}
    <Button disabled={busy} loading={busy} title={workspace.current ? 'Regenerate Motivation from corrections' : 'Generate Motivation for review'} onPress={() => void run(() => generateMotivation(identity, review))} />
    {workspace.current && <>
      <Button disabled={busy || !dirty} title="Save corrections" variant="secondary" onPress={() => void run(() => saveMotivationCorrections(identity, workspace.current!.id, review))} />
      <Button disabled={busy || dirty || workspace.state === 'OUTDATED'} title="Open generated Motivation for review" variant="secondary" onPress={() => void run(() => preview(), false)} />
      <Button disabled={busy || dirty || !read || workspace.state === 'OUTDATED'} title={`${confirmAccurate ? '✓ ' : ''}I reviewed this generated version and confirm its facts, claims and annexures`} variant="secondary" onPress={() => setConfirmAccurate(v => !v)} />
      <Button disabled={busy || dirty || !read || !confirmAccurate || workspace.issues.length > 0 || workspace.state === 'OUTDATED'} title="Confirm current Motivation" onPress={() => void run(() => confirmMotivation(identity, workspace.current!.id))} />
      <Button disabled={busy || dirty || workspace.state !== 'CONFIRMED'} title="Release confirmed PDF" variant="secondary" onPress={() => void run(async () => { await assertCurrentMotivationReleased(identity, workspace.current!.id); await preview(); }, false)} />
    </>}
    <Text style={textStyle}>The generated A4 Motivation index uses actual section page numbers. Review the regenerated pages and supporting annexures before confirmation.</Text>
    <Text style={textStyle}>Version history (older versions are retained and cannot replace the current version):</Text>
    {workspace.history.map(d => <Button key={d.id} disabled={busy} title={`Review version ${d.version_number}${d.id === workspace.current?.id && workspace.state !== 'OUTDATED' ? ' — current' : ' — historical / outdated'}`} variant="ghost" onPress={() => void run(() => preview(d, 'history'), false)} />)}
    <Button disabled={busy} title="Reload saved source data / Research" variant="ghost" onPress={() => void load()} />
  </Card>;
}
