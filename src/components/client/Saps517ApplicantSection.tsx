import { Pressable, Text, View } from 'react-native';
import Card from '../Card';
import TextField from '../TextField';
import { Colors } from '../../theme/colors';
import { Spacing } from '../../theme/spacing';
import type { Saps271Declarations, Saps517Answer, Saps517ApplicantData, Saps517MaritalStatus } from '../../types/saps271Declarations';
import { deriveSouthAfricanIdDetails } from '../../utils/southAfricanId';
import { getSaps517ApplicantData, SAPS517_ADDITIONAL_DECLARATIONS } from '../../utils/saps517Applicant';

const MARITAL_OPTIONS: Array<{ value: Exclude<Saps517MaritalStatus, 'NOT_ANSWERED' | 'OTHER'> | 'OTHER'; label: string }> = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'MARRIED', label: 'Married' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOW', label: 'Widow' },
  { value: 'WIDOWER', label: 'Widower' },
  { value: 'OTHER', label: 'Other' },
];

const UNDER_21_OPTIONS: Array<{ value: Exclude<Saps517ApplicantData['under21Reason'], 'NOT_ANSWERED'>; label: string }> = [
  { value: 'BUSINESS', label: 'Conduct a business' },
  { value: 'EMPLOYED', label: 'Gainfully employed' },
  { value: 'DEDICATED_HUNTER', label: 'Dedicated hunter' },
  { value: 'DEDICATED_SPORTSPERSON', label: 'Dedicated sportsperson' },
  { value: 'PRIVATE_COLLECTOR', label: 'Private collector' },
  { value: 'PUBLIC_COLLECTOR', label: 'Public collector' },
  { value: 'OTHER', label: 'Other' },
];

export default function Saps517ApplicantSection({
  value,
  idNumber,
  disabled = false,
  onChange,
}: {
  value?: Saps271Declarations | null;
  idNumber: string;
  disabled?: boolean;
  onChange?: (next: Saps517ApplicantData) => void;
}) {
  const data = getSaps517ApplicantData(value);
  const derived = deriveSouthAfricanIdDetails(idNumber);
  const update = (next: Saps517ApplicantData) => onChange?.(next);
  const updateField = <K extends keyof Saps517ApplicantData>(key: K, fieldValue: Saps517ApplicantData[K]) => {
    update({ ...data, [key]: fieldValue });
  };
  const answerChoices = (current: Saps517Answer, onSelect: (answer: Saps517Answer) => void) => (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      {(['NOT_ANSWERED', 'YES', 'NO'] as const).map((answer) => (
        <Pressable
          key={answer}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === answer, disabled: disabled || !onChange }}
          disabled={disabled || !onChange}
          onPress={() => onSelect(answer)}
          style={{ padding: Spacing.sm, borderWidth: 1, borderColor: current === answer ? Colors.primary : Colors.textMuted, borderRadius: 6 }}
        >
          <Text style={{ color: current === answer ? Colors.primary : Colors.text }}>{answer === 'YES' ? 'Yes' : answer === 'NO' ? 'No' : 'Not answered'}</Text>
        </Pressable>
      ))}
    </View>
  );
  const optionGroup = <T extends string>(options: Array<{ value: T; label: string }>, selected: T | '', onSelect: (value: T) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === option.value, disabled: disabled || !onChange }}
          disabled={disabled || !onChange}
          onPress={() => onSelect(option.value)}
          style={{ padding: Spacing.sm, borderWidth: 1, borderColor: selected === option.value ? Colors.primary : Colors.textMuted, borderRadius: 6 }}
        >
          <Text style={{ color: selected === option.value ? Colors.primary : Colors.text }}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Card title="SAPS 517 applicant information" subtitle="Profile facts derived from the validated ID are reused. Answers and declarations must be supplied by the applicant; LicenceGuard does not infer them.">
      <Text style={{ color: Colors.textMuted }}>H5–H10 reuse the six answers in Background &amp; Declarations above. Complete those answers as well as the questions below.</Text>
      <Text style={{ color: Colors.textMuted }}>
        {derived
          ? `Date of birth ${derived.dateOfBirth} | Age ${derived.age} | ${derived.gender}`
          : 'A valid South African ID is needed to derive date of birth, age and gender.'}
      </Text>

      <>
        <Text style={{ color: Colors.text, fontWeight: '600' }}>Type of citizenship</Text>
        {optionGroup([
          { value: 'SA_CITIZEN' as const, label: 'SA citizen' },
          { value: 'PERMANENT_RESIDENT' as const, label: 'Non-SA citizen with permanent residence' },
        ], data.citizenshipChoice === 'NOT_ANSWERED' ? '' : data.citizenshipChoice, (choice) => updateField('citizenshipChoice', choice))}
      </>

      <Text style={{ color: Colors.text, fontWeight: '600' }}>Do spouse / partner particulars apply?</Text>
      {answerChoices(data.spouseApplicable, (answer) => updateField('spouseApplicable', answer))}
      {data.spouseApplicable === 'YES' ? <>
        {optionGroup([{ value: 'SA_ID' as const, label: 'SA ID' }, { value: 'PASSPORT' as const, label: 'Passport' }], data.spouseIdType === 'NOT_ANSWERED' ? '' : data.spouseIdType, (choice) => updateField('spouseIdType', choice))}
        <TextField label="Spouse / partner identity or passport number" required editable={Boolean(onChange) && !disabled} value={data.spouseIdentityNumber} onChangeText={(text) => updateField('spouseIdentityNumber', text)} />
      </> : null}
      <TextField label="Description of type of residence" required editable={Boolean(onChange) && !disabled} value={data.residenceDescription} onChangeText={(text) => updateField('residenceDescription', text)} placeholder="e.g. house, flat, cottage" />
      <Text style={{ color: Colors.text, fontWeight: '600' }}>Postal address</Text>
      {optionGroup([
        { value: 'YES' as const, label: 'Same as residential' },
        { value: 'NO' as const, label: 'Different postal address' },
      ], data.postalAddressSameAsResidential === 'NOT_ANSWERED' ? '' : data.postalAddressSameAsResidential, (choice) => update({ ...data, postalAddressSameAsResidential: choice }))}
      {data.postalAddressSameAsResidential === 'NO' ? <>
        <TextField label="Postal address" required editable={Boolean(onChange) && !disabled} value={data.postalAddress} onChangeText={(text) => updateField('postalAddress', text)} multiline />
        <TextField label="Postal locality / town" required editable={Boolean(onChange) && !disabled} value={data.postalLocality} onChangeText={(text) => updateField('postalLocality', text)} />
        <TextField label="Postal address code" required editable={Boolean(onChange) && !disabled} value={data.postalAddressPostalCode} onChangeText={(text) => updateField('postalAddressPostalCode', text)} keyboardType="numeric" />
      </> : null}
      <TextField label="Trade or profession" required editable={Boolean(onChange) && !disabled} value={data.occupation} onChangeText={(text) => updateField('occupation', text)} />
      <Text style={{ color: Colors.text, fontWeight: '600' }}>Employment particulars</Text>
      {optionGroup([{ value: 'EMPLOYED' as const, label: 'Employed' }, { value: 'SELF_EMPLOYED' as const, label: 'Self-employed' }, { value: 'NOT_APPLICABLE' as const, label: 'Not applicable (e.g. retired)' }], data.employmentStatus === 'NOT_ANSWERED' ? '' : data.employmentStatus, (choice) => updateField('employmentStatus', choice))}
      <TextField label="Employer / company name" editable={Boolean(onChange) && !disabled} value={data.employerName} onChangeText={(text) => updateField('employerName', text)} />
      <TextField label="Business address" editable={Boolean(onChange) && !disabled} value={data.businessAddress} onChangeText={(text) => updateField('businessAddress', text)} multiline />
      <TextField label="Business postal code" editable={Boolean(onChange) && !disabled} value={data.businessPostalCode} onChangeText={(text) => updateField('businessPostalCode', text)} keyboardType="numeric" />
      <TextField label="Work telephone" editable={Boolean(onChange) && !disabled} value={data.workTelephone} onChangeText={(text) => updateField('workTelephone', text)} keyboardType="phone-pad" />
      <TextField label="Fax number" editable={Boolean(onChange) && !disabled} value={data.faxNumber} onChangeText={(text) => updateField('faxNumber', text)} keyboardType="phone-pad" />

      <Text style={{ color: Colors.text, fontWeight: '600' }}>Marital status</Text>
      {optionGroup(MARITAL_OPTIONS, data.maritalStatus === 'NOT_ANSWERED' ? '' : data.maritalStatus, (choice) => update({ ...data, maritalStatus: choice }))}
      {data.maritalStatus === 'OTHER' ? <TextField label="Other marital status" required editable={Boolean(onChange) && !disabled} value={data.otherMaritalStatus} onChangeText={(text) => updateField('otherMaritalStatus', text)} /> : null}

      <Text style={{ color: Colors.text, fontWeight: '600' }}>Section G1. Prescribed Firearms Control Act knowledge test</Text>
      {answerChoices(data.knowledgeOfActTest, (answer) => updateField('knowledgeOfActTest', answer))}
      <Text style={{ color: Colors.text, fontWeight: '600' }}>Section G2. Prescribed safe and efficient firearm handling training/practical tests</Text>
      {answerChoices(data.safeHandlingTrainingTest, (answer) => updateField('safeHandlingTrainingTest', answer))}
      <Text style={{ color: Colors.textMuted }}>Section G3 category is taken from this application’s saved competency category; it is not asked again.</Text>

      <Text style={{ color: Colors.text, fontWeight: '600' }}>Section H1. Accredited training certificate</Text>
      {answerChoices(data.accreditedTrainingCertificate.answer, (answer) => update({ ...data, accreditedTrainingCertificate: { ...data.accreditedTrainingCertificate, answer } }))}
      {data.accreditedTrainingCertificate.answer === 'YES' ? <>
        <TextField label="Accredited training institution" required editable={Boolean(onChange) && !disabled} value={data.accreditedTrainingCertificate.institution} onChangeText={(text) => update({ ...data, accreditedTrainingCertificate: { ...data.accreditedTrainingCertificate, institution: text } })} />
        <TextField label="Training certificate serial number" required editable={Boolean(onChange) && !disabled} value={data.accreditedTrainingCertificate.serialNumber} onChangeText={(text) => update({ ...data, accreditedTrainingCertificate: { ...data.accreditedTrainingCertificate, serialNumber: text } })} />
        <TextField label="Training certificate date issued" required editable={Boolean(onChange) && !disabled} value={data.accreditedTrainingCertificate.dateIssued} onChangeText={(text) => update({ ...data, accreditedTrainingCertificate: { ...data.accreditedTrainingCertificate, dateIssued: text } })} placeholder="YYYY-MM-DD" />
      </> : null}

      {SAPS517_ADDITIONAL_DECLARATIONS.map((question) => {
        const response = data.additionalDeclarations[question.key];
        return <View key={question.key} style={{ gap: Spacing.sm }}>
          <Text style={{ color: Colors.text, fontWeight: '600' }}>H{question.number}. {question.label}</Text>
          {answerChoices(response.answer, (answer) => update({ ...data, additionalDeclarations: { ...data.additionalDeclarations, [question.key]: { ...response, answer } } }))}
          {response.answer === 'YES' ? <TextField label={`Details for H${question.number}`} required editable={Boolean(onChange) && !disabled} value={response.details} onChangeText={(text) => update({ ...data, additionalDeclarations: { ...data.additionalDeclarations, [question.key]: { ...response, details: text } } })} multiline /> : null}
        </View>;
      })}

      {derived && derived.age < 21 ? <>
        <Text style={{ color: Colors.text, fontWeight: '600' }}>H17.1. Compelling reason for an applicant under 21</Text>
        {optionGroup(UNDER_21_OPTIONS, data.under21Reason === 'NOT_ANSWERED' ? '' : data.under21Reason, (choice) => updateField('under21Reason', choice))}
        <TextField label="H17.2 Full compelling reason details" required editable={Boolean(onChange) && !disabled} value={data.under21OtherDetails} onChangeText={(text) => updateField('under21OtherDetails', text)} multiline />
      </> : null}

    </Card>
  );
}
