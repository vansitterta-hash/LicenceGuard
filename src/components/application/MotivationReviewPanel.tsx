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
import { applicableMotivationEvidence, MASTER_ASSERTIONS, motivationResearchSources } from '../../engines/canonicalMotivationEngine';
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
  const collector = workspace.sources.application.licence_section === '17';
  const preview = async (document = workspace.current) => {
    if (!document) return;
    await openExternalDocument(() => createDocumentSignedUrl(document.storage_path), { originatingRoute: 'ApplicationReadiness', applicationCaseId: identity.applicationCaseId, clientId: identity.clientId, workflowStep: 'motivation-review' });
    if (document.id === workspace.current?.id && !dirty && workspace.state !== 'OUTDATED') { await markMotivationReviewed(identity, document.id); setRead(true); }
  };
  return <Card title="Canonical Motivation" subtitle="Generate, review, correct and confirm this application’s Motivation before release.">
    <Text style={textStyle}>Current version: {workspace.current?.version_number ?? 'Not generated'} · {dirty ? 'Corrections require regeneration' : workspace.state}</Text>
    <TextField editable={!busy} label="Applicant background (confirm personal facts)" multiline value={review.background} maxLength={6000} onChangeText={background => update({ background })} />
    <TextField editable={!busy} label="Application-specific motivation / lawful need" multiline value={review.narrative} maxLength={12000} onChangeText={narrative => update({ narrative })} />
    <Text style={textStyle}>Confirm each statement only if true. Unknown or conflicting answers block release; correct stored details through the existing profile/application screens.</Text>
    {Object.entries(MASTER_ASSERTIONS).map(([key, a]) => <Button key={key} disabled={busy} variant="secondary" title={`${review.assertions[key] ? '✓ ' : 'Confirm: '}${a.label}`} onPress={() => update({ assertions: { ...review.assertions, [key]: !review.assertions[key] } })} />)}
    <Text style={textStyle}>Verified annexures — select only evidence applicable to this application.</Text>
    {evidence.map(d => <View key={d.id}><Button disabled={busy} variant="secondary" title={`${review.evidenceIds.includes(d.id) ? '✓ ' : ''}${d.document_name}`} onPress={() => update({ evidenceIds: review.evidenceIds.includes(d.id) ? review.evidenceIds.filter(id => id !== d.id) : [...review.evidenceIds, d.id] })} /><Button disabled={busy} title="Review supporting file" variant="ghost" onPress={() => void run(() => preview(d), false)} /></View>)}
    {review.evidenceIds.some(id => !evidence.some(d => d.id === id)) && <Button disabled={busy} title="Remove unavailable or no-longer-verified annexures" onPress={() => update({ evidenceIds: review.evidenceIds.filter(id => evidence.some(d => d.id === id)) })} />}
    <Text style={textStyle}>Research claims — inspect the original source, correct the claim, then explicitly mark it reviewed. Unreviewed results are omitted.</Text>
    {review.claims.some(c => !research.some(s => s.documentId === c.documentId && s.id === c.sourceId)) && <Button disabled={busy} title="Remove claims whose Research sources are no longer available" onPress={() => update({ claims: review.claims.filter(c => research.some(s => s.documentId === c.documentId && s.id === c.sourceId)) })} />}
    {research.map(source => {
      const claim = review.claims.find(c => c.documentId === source.documentId && c.sourceId === source.id);
      const sourceSnapshot = stableMotivationJson(source);
      const claimReviewed = claim?.reviewed && claim.sourceSnapshot === sourceSnapshot;
      const change = (patch: Partial<NonNullable<typeof claim>>) => update({ claims: [...review.claims.filter(c => !(c.documentId === source.documentId && c.sourceId === source.id)), { documentId: source.documentId, sourceId: source.id, text: claim?.text ?? source.summary ?? '', section: claim?.section ?? 'Firearm relevance', reviewed: claim?.reviewed ?? false, ...patch }] });
      return <View key={`${source.documentId}:${source.id}`}>
        <Text style={textStyle}>{source.title}</Text>
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
      <Button disabled={busy} title="Open generated Motivation for review" variant="secondary" onPress={() => void run(() => preview(), false)} />
      <Button disabled={busy || dirty || !read || workspace.state === 'OUTDATED'} title={`${confirmAccurate ? '✓ ' : ''}I reviewed this generated version and confirm its facts, claims and annexures`} variant="secondary" onPress={() => setConfirmAccurate(v => !v)} />
      <Button disabled={busy || dirty || !read || !confirmAccurate || workspace.issues.length > 0 || workspace.state === 'OUTDATED'} title="Confirm current Motivation" onPress={() => void run(() => confirmMotivation(identity, workspace.current!.id))} />
      <Button disabled={busy || dirty || workspace.state !== 'CONFIRMED'} title="Release confirmed PDF" variant="secondary" onPress={() => void run(async () => { await assertCurrentMotivationReleased(identity, workspace.current!.id); await preview(); }, false)} />
    </>}
    <Text style={textStyle}>Index page numbers are intentionally blank. Review final pagination before physical submission.</Text>
    <Text style={textStyle}>Version history (older versions are retained and cannot replace the current version):</Text>
    {workspace.history.map(d => <Button key={d.id} disabled={busy} title={`Review version ${d.version_number}${d.id === workspace.current?.id ? ' — current' : ' — historical'}`} variant="ghost" onPress={() => void run(() => preview(d), false)} />)}
    <Button disabled={busy} title="Reload saved source data / Research" variant="ghost" onPress={() => void load()} />
  </Card>;
}
