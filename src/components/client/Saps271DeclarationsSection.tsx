import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Card from '../Card';
import Button from '../Button';
import TextField from '../TextField';
import { Colors } from '../../theme/colors';
import { Spacing } from '../../theme/spacing';
import type { DeclarationAnswer, DeclarationKey, Saps271Declarations } from '../../types/saps271Declarations';
import { DECLARATION_QUESTIONS, DECLARATION_DETAIL_LABELS, declarationDataIssues, emptySaps271Declarations } from '../../utils/saps271Declarations';

export default function Saps271DeclarationsSection({ value, onChange, disabled = false }: {
  value?: Saps271Declarations | null;
  onChange?: (next: Saps271Declarations) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const declarations = value ?? emptySaps271Declarations();
  const issues = declarationDataIssues(declarations);
  const change = (key: DeclarationKey, response: Saps271Declarations['answers'][DeclarationKey]) => {
    onChange?.({ ...declarations, confirmedAt: null, answers: { ...declarations.answers, [key]: response } });
  };
  return <Card title="SAPS 271 Background & Declarations" subtitle="Client information reused for firearm licence applications. Review again after creating each new SAPS 271 case.">
    <Text style={{ color: Colors.textMuted }}>Last confirmed: {declarations.confirmedAt ? new Date(declarations.confirmedAt).toLocaleString('en-ZA') : 'Not confirmed'}</Text>
    <Button title={expanded ? 'Hide declarations' : onChange ? 'Review declarations' : 'View declarations'} onPress={() => setExpanded(!expanded)} />
    {expanded ? <View style={{ gap: Spacing.md }}>
      {DECLARATION_QUESTIONS.map((question) => {
        const response = declarations.answers[question.key] ?? { answer: 'NOT_ANSWERED' as const, incidents: [] };
        return <View key={question.key} style={{ gap: Spacing.sm }}>
          <Text style={{ color: Colors.text, fontWeight: '600' }}>G{question.number}. {question.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
            {(['NOT_ANSWERED', 'YES', 'NO'] as DeclarationAnswer[]).map((answer) => <Pressable key={answer} accessibilityRole="radio" accessibilityState={{ checked: response.answer === answer, disabled: !onChange || disabled }} disabled={!onChange || disabled} onPress={() => change(question.key, { ...response, answer, incidents: answer === 'YES' && !response.incidents.length ? [{}] : response.incidents })} style={{ padding: Spacing.sm, borderWidth: 1, borderColor: response.answer === answer ? Colors.primary : Colors.textMuted, borderRadius: 6 }}>
              <Text style={{ color: response.answer === answer ? Colors.primary : Colors.text }}>{answer === 'NOT_ANSWERED' ? 'Not answered' : answer === 'YES' ? 'Yes' : 'No'}</Text>
            </Pressable>)}
          </View>
          {response.answer === 'YES' ? <>
            {response.incidents.map((incident, index) => <View key={index} style={{ gap: Spacing.sm }}>
              <Text style={{ color: Colors.textMuted }}>Incident {index + 1}</Text>
              {question.details.map((field) => <TextField key={field} label={DECLARATION_DETAIL_LABELS[field]} required editable={Boolean(onChange) && !disabled} value={incident[field] ?? ''} onChangeText={(text) => change(question.key, { ...response, incidents: response.incidents.map((item, i) => i === index ? { ...item, [field]: text } : item) })} />)}
              {onChange && index > 0 ? <Button title="Remove second incident" disabled={disabled} onPress={() => change(question.key, { ...response, incidents: response.incidents.slice(0, 1) })} /> : null}
            </View>)}
            {onChange && response.incidents.length < 2 ? <Button title="Add second incident" disabled={disabled} onPress={() => change(question.key, { ...response, incidents: [...response.incidents, {}] })} /> : null}
            <Text style={{ color: Colors.textMuted }}>The official form has space for two incidents. Additional incidents require a separately reviewed continuation; do not omit them.</Text>
          </> : null}
        </View>;
      })}
      {onChange ? <>
        <Text style={{ color: Colors.textMuted }}>{issues.length ? 'Answer all questions and complete the applicable incident details before confirming. You can save incomplete declarations.' : 'Confirm that the client has reviewed these answers for their current SAPS 271 application(s), then save the client.'}</Text>
        <Button title="Confirm declarations reviewed now" disabled={disabled || issues.length > 0} onPress={() => onChange({ ...declarations, confirmedAt: new Date().toISOString() })} />
      </> : null}
    </View> : null}
  </Card>;
}
