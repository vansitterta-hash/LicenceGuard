import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Button from '../Button';
import Card from '../Card';
import TextField from '../TextField';
import { Colors } from '../../theme/colors';
import { applicationFormAnswers, evaluateApplicationForm, FURTHER_CATEGORIES, licenceTermKey, licenceTermNeedsReview, type ApplicationFormAnswers, type FormCase, type FormCompetency, type FormLicence } from '../../utils/applicationFormAnswers';
import { saveApplicationFormAnswers } from '../../services/applicationFormAnswerService';
import type { Saps271Declarations } from '../../types/saps271Declarations';
import Saps271DeclarationsSection from './Saps271DeclarationsSection';
import { emptySaps271Declarations } from '../../utils/saps271Declarations';

export default function ApplicationFormQuestions(props: {
  application: FormCase; profile?: Saps271Declarations | null; idNumber: string;
  competencies: FormCompetency[]; competency?: FormCompetency | null; licence?: FormLicence | null;
  firearm?: { id: string; model?: string | null; serial_number?: string | null } | null;
  dealerId: string; clientId: string; userId: string; onSaved: (profile: Saps271Declarations) => void;
  saveRef?: { current: (() => Promise<void>) | null };
}) {
  const [answers, setAnswers] = useState<ApplicationFormAnswers>(() => applicationFormAnswers(props.profile, props.application.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [declarations, setDeclarations] = useState(() => props.profile ?? emptySaps271Declarations());
  const saps271 = ['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'].includes(props.application.application_type);
  const further = props.application.application_type === 'COMPETENCY_ADDITIONAL_CATEGORY';
  const renewal = props.application.application_type === 'COMPETENCY_RENEWAL';
  const firearmRenewal = props.application.application_type === 'FIREARM_LICENCE_RENEWAL';
  const evaluation = evaluateApplicationForm({ ...props, profile: { answers: props.profile?.answers ?? {} as Saps271Declarations['answers'], confirmedAt: props.profile?.confirmedAt ?? null, ...props.profile, applications: { ...props.profile?.applications, [props.application.id]: answers } } });
  const update = (patch: Partial<ApplicationFormAnswers>) => { setAnswers(a => ({ ...a, ...patch })); setDirty(true); setMessage('Unsaved answers'); };
  const save = async (confirmedDeclarations = declarations) => {
    setSaving(true);
    try { const profile = await saveApplicationFormAnswers({ ...props, caseId: props.application.id, answers, ...(saps271 ? { declarations: confirmedDeclarations } : {}) }); props.onSaved(profile); setDirty(false); setMessage('Applicant answers saved'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save applicant answers'); throw error; }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (props.saveRef) props.saveRef.current = dirty ? save : null;
    return () => { if (props.saveRef) props.saveRef.current = null; };
  });
  const selected = answers.furtherCategories ?? (props.application.competency_category ? [props.application.competency_category] : []);
  const firearmAnswers = answers.saps271Firearm?.firearmId === props.firearm?.id ? answers.saps271Firearm : undefined;
  const updateFirearm = (patch: Partial<NonNullable<ApplicationFormAnswers['saps271Firearm']>>) => {
    if (props.firearm) update({ saps271Firearm: { ...firearmAnswers, ...patch, firearmId: props.firearm.id } });
  };
  return <Card title="Application form answers" subtitle="Save these answers for this application. Existing profile declarations and certificate facts are reused.">
    {saps271 ? <Saps271DeclarationsSection value={declarations} disabled={saving}
      onChange={value => { setDeclarations(value); setDirty(true); setMessage('Unsaved answers'); }}
      onConfirm={value => { setDeclarations(value); setDirty(true); void save(value).catch(() => undefined); }} /> : null}
    {saps271 ? <>
      <Text style={{ color: Colors.text }}>SAPS 271 firearm details for serial {props.firearm?.serial_number || 'not selected'}. Model: {props.firearm?.model || 'missing — enter it using Edit firearm'}. Enter only information verified on this firearm.</Text>
      {!props.firearm?.model?.trim() ? <Button disabled={saving || !props.firearm} title={firearmAnswers?.modelNotMarked ? 'No model marked/applicable confirmed' : 'Confirm no model is marked/applicable'} onPress={() => updateFirearm({ modelNotMarked: !firearmAnswers?.modelNotMarked })} /> : null}
      <Text style={{ color: Colors.text }}>Explicit firearm action</Text>
      {(['MANUAL','SEMI_AUTOMATIC','AUTOMATIC','OTHER'] as const).map(action => <Button key={action} disabled={saving || !props.firearm} title={`${firearmAnswers?.action === action ? '✓ ' : ''}${action.replaceAll('_',' ')}`} onPress={() => updateFirearm({action})} />)}
      {firearmAnswers?.action === 'OTHER' ? <TextField label="Other action (as recorded on firearm)" value={firearmAnswers.otherAction ?? ''} onChangeText={otherAction=>updateFirearm({otherAction})} /> : null}
      <Text style={{ color: Colors.text }}>Enter serials only for the components actually bearing them. Leave other components blank; do not copy the generic serial without identifying its component.</Text>
      {(['barrelSerial','frameSerial','receiverSerial'] as const).map(key=><TextField key={key} label={`${key.replace('Serial','')} serial number`} value={firearmAnswers?.[key] ?? ''} onChangeText={value=>updateFirearm({[key]:value})} />)}
      {['16','17','19'].includes((props.application.licence_section ?? '').replace(/\D/g,'')) ? <>
        <Text style={{ color: Colors.text }}>G55. Are you a member of an accredited association?</Text>
        {(['YES','NO'] as const).map(value=><Button key={value} disabled={saving} title={`${answers.associationMember===value?'✓ ':''}${value}`} onPress={()=>update({associationMember:value})} />)}
        {answers.associationMember === 'YES' ? <>
          {props.application.sport_association?.trim() ? <Text style={{ color: Colors.text }}>Accredited association: {props.application.sport_association}</Text> : <TextField label="Accredited association name" value={answers.associationName ?? ''} onChangeText={associationName=>update({associationName})} />}
          <TextField label="Association FAR/accreditation number" value={answers.associationFar ?? ''} onChangeText={associationFar=>update({associationFar})} />
          <TextField label="Association membership number" value={answers.associationNumber ?? ''} onChangeText={associationNumber=>update({associationNumber})} />
          <TextField label="Association joining date (YYYY-MM-DD)" value={answers.associationJoined ?? ''} onChangeText={associationJoined=>update({associationJoined})} />
          {!answers.associationNoExpiry ? <TextField label="Membership expiry (YYYY-MM-DD)" value={answers.associationExpiry ?? ''} onChangeText={associationExpiry=>update({associationExpiry})} /> : null}
          <Button disabled={saving} title={`${answers.associationNoExpiry?'✓ ':''}No membership expiry applies`} onPress={()=>update({associationNoExpiry:!answers.associationNoExpiry})} />
        </> : null}
      </> : null}
      <Text style={{ color: Colors.text }}>Purpose printed on SAPS 271: {evaluation.fields.saps271Purpose || 'Missing — enter primary purpose and discipline in this application.'}</Text>
      <Text style={{ color: Colors.text }}>G68. Do you have the prescribed safe?</Text>
      {(['YES','NO'] as const).map(value=><Button key={value} disabled={saving} title={`${answers.prescribedSafe===value?'✓ ':''}${value}`} onPress={()=>update({prescribedSafe:value})} />)}
      {answers.prescribedSafe === 'YES' ? <>
        {(['HANDGUN','RIFLE','STRONGROOM','DEVICE'] as const).map(safeType=><Button key={safeType} disabled={saving} title={`${answers.safeType===safeType?'✓ ':''}${safeType}`} onPress={()=>update({safeType})} />)}
        <TextField label="Short safe description (maximum 40 characters)" value={answers.safeDetails ?? ''} onChangeText={safeDetails=>update({safeDetails})} />
      </> : null}
      <Text style={{ color: Colors.text }}>G69. Is the safe mounted?</Text>
      {(['YES','NO'] as const).map(value=><Button key={value} disabled={saving} title={`${answers.safeMounted===value?'✓ ':''}${value}`} onPress={()=>update({safeMounted:value})} />)}
      {answers.safeMounted === 'YES' ? (['WALL','FLOOR'] as const).map(mount=><Button key={mount} disabled={saving} title={`${answers.safeMountings?.includes(mount)?'✓ ':''}${mount}`} onPress={()=>update({safeMountings:answers.safeMountings?.includes(mount)?answers.safeMountings.filter(m=>m!==mount):[...answers.safeMountings??[],mount]})} />) : null}
    </> : null}
    {further ? <>
      <Text style={{ color: Colors.text }}>Further competency categories (select all that apply to the printed form)</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{FURTHER_CATEGORIES.map(category => <Button key={category} title={`${selected.includes(category) ? '✓ ' : ''}${category}`} disabled={saving} onPress={() => update({ furtherCategories: selected.includes(category) ? selected.filter(c => c !== category) : [...selected, category] })} />)}</View>
      <Text style={{ color: Colors.text }}>Current/previous certificate: select its stored category records. Categories on the same certificate may be selected together.</Text>
      {props.competencies.map(c => <Button key={c.id} title={`${evaluation.previousCompetencies.some(p => p.id === c.id) ? '✓ ' : ''}${c.category} — ${c.certificate_number ?? 'Number missing'} (${c.issue_date ?? 'Issue date missing'})`} disabled={saving} onPress={() => {
        const ids = evaluation.previousCompetencies.map(p => p.id);
        update({ previousCompetencyIds: ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id] });
      }} />)}
      <Text style={{ color: Colors.text }}>F5. Are you a member of an accredited association?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['YES', 'NO'] as const).map(answer => <Button key={answer} title={`${answers.associationMember === answer ? '✓ ' : ''}${answer}`} disabled={saving} onPress={() => update({ associationMember: answer })} />)}</View>
      {answers.associationMember === 'YES' ? <>
        <TextField label="Accredited association" value={answers.associationName ?? ''} onChangeText={associationName => update({ associationName })} />
        <TextField label="Membership number" value={answers.associationNumber ?? ''} onChangeText={associationNumber => update({ associationNumber })} />
        <TextField label="Date joined (YYYY-MM-DD)" value={answers.associationJoined ?? ''} onChangeText={associationJoined => update({ associationJoined })} />
      </> : null}
    </> : null}
    {renewal || firearmRenewal ? <>
      <Text style={{ color: Colors.text }}>Confirm the intended or actual SAPS hand-in date. It is used only for renewal timing, never as your signature date.</Text>
      <TextField label="SAPS hand-in date (YYYY-MM-DD)" value={answers.submissionDate ?? (props.application.actual_submission_date || props.application.target_submission_date || '')} onChangeText={submissionDate => update({ submissionDate, submissionKind: undefined })} />
      {(['INTENDED', 'ACTUAL'] as const).map(kind => <Button key={kind} disabled={saving} title={`${answers.submissionKind === kind ? '✓ ' : ''}Confirm ${kind.toLowerCase()} hand-in date`} onPress={() => update({ submissionKind: kind, submissionDate: answers.submissionDate ?? (props.application.actual_submission_date || props.application.target_submission_date || '') })} />)}
      <Text style={{ color: Colors.text }}>At least 90 days before expiry: {evaluation.fields.before90 || 'Unknown'}. After expiry: {evaluation.fields.afterExpiry || 'Unknown'}.</Text>
      {evaluation.fields.before90 === 'NO' ? <TextField label="Reason for not handing in 90 days before expiry" multiline value={answers.before90Reason ?? ''} onChangeText={before90Reason => update({ before90Reason })} /> : null}
      {firearmRenewal && evaluation.fields.beforeExpiry === 'YES' ? <TextField label="Reason for handing in after the due date but before expiry" multiline value={answers.beforeExpiryReason ?? ''} onChangeText={beforeExpiryReason => update({ beforeExpiryReason })} /> : null}
      {evaluation.fields.afterExpiry === 'YES' ? <TextField label="Reason for handing in after expiry" multiline value={answers.afterExpiryReason ?? ''} onChangeText={afterExpiryReason => update({ afterExpiryReason })} /> : null}
    </> : null}
    {licenceTermNeedsReview(props.licence) ? <>
      <Text style={{ color: Colors.text }}>Recorded licence: section {props.licence?.licence_section}, issued {props.licence?.issue_date}, expires {props.licence?.expiry_date}. Check these dates against the existing licence.</Text>
      <Button disabled={saving} title={answers.licenceTermConfirmed === licenceTermKey(props.licence) ? 'Recorded licence term confirmed' : 'Confirm recorded licence term is correct'} onPress={() => update({ licenceTermConfirmed: licenceTermKey(props.licence) })} />
    </> : null}
    {evaluation.issues.map(issue => <Text key={issue} style={{ color: Colors.textMuted }}>{issue}</Text>)}
    <Button title="Save application form answers" loading={saving} onPress={() => void save().catch(() => undefined)} />
    {message ? <Text accessibilityRole="alert" style={{ color: Colors.text }}>{message}</Text> : null}
  </Card>;
}
