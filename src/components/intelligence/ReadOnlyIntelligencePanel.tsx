import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import Card from '../Card';
import { getLocalIntelligenceFeatureFlags } from '../../intelligence/featureFlags';
import {
  buildReadOnlyIntelligencePreview,
  type ReadOnlyIntelligencePreview,
} from '../../intelligence/readOnlyIntelligenceService';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/radius';
import { Spacing } from '../../theme/spacing';
import { Typography } from '../../theme/typography';
import { getDocumentTypeLabel } from '../../types/document';

type Props = { applicationCaseId: string };

const READ_ONLY_ENABLED = getLocalIntelligenceFeatureFlags().READ_ONLY_INTELLIGENCE;

export default function ReadOnlyIntelligencePanel({ applicationCaseId }: Props) {
  const [preview, setPreview] = useState<ReadOnlyIntelligencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!READ_ONLY_ENABLED) return;
    let active = true;
    setError(null);
    void buildReadOnlyIntelligencePreview(applicationCaseId)
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'The intelligence preview could not be loaded.');
        }
      });
    return () => {
      active = false;
    };
  }, [applicationCaseId]);

  if (!READ_ONLY_ENABLED) return null;

  return (
    <Card title="Read-only intelligence preview">
      <Text style={styles.notice}>
        Read-only intelligence preview — does not change this application.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!preview && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.muted}>Comparing durable application sources...</Text>
        </View>
      ) : null}

      {preview ? (
        <View style={styles.sections}>
          <Section title="Canonical context">
            <Text style={styles.line}>Client: {preview.contextSummary.client}</Text>
            <Text style={styles.line}>Application: {preview.applicationType}</Text>
            <Text style={styles.line}>Firearm: {preview.contextSummary.firearm ?? 'Not applicable or unavailable'}</Text>
            <Text style={styles.line}>Competency: {preview.contextSummary.competencyCategory ?? 'Not applicable or unavailable'}</Text>
            <Text style={styles.line}>Licence section: {preview.contextSummary.licenceSection ?? 'Not recorded'}</Text>
            <Text style={styles.line}>Readiness: {preview.contextSummary.readinessState ?? 'Unavailable'} · Pack: {preview.contextSummary.packState}</Text>
          </Section>

          <Section title="Authoritative data and source coverage">
            <Text style={styles.line}>
              Missing: {preview.missingAuthoritativeData.join(', ') || 'None identified'}
            </Text>
            <Text style={styles.line}>Searched: {preview.sourceScopesSearched.join(', ')}</Text>
            <Text style={styles.line}>
              Unavailable: {preview.unavailableSourceScopes.join(', ') || 'None'}
            </Text>
          </Section>

          <Section title="Comparison with current production path">
            <Text style={styles.classification}>{preview.productionComparison.classification}</Text>
            <Text style={styles.line}>{preview.productionComparison.sourceEquivalence}</Text>
            <Text style={styles.line}>
              Current path: {preview.productionComparison.currentPathSelectionTitle ?? 'No selection'}
            </Text>
            <Text style={styles.muted}>{preview.productionComparison.explanation}</Text>
            {preview.productionComparison.equivalenceEvidence.map((evidence) => (
              <Text key={evidence} style={styles.muted}>• {evidence}</Text>
            ))}
          </Section>

          <Section title={`Candidates considered (${preview.candidatesConsidered.length})`}>
            {preview.recommendations.length === 0 ? (
              <Text style={styles.muted}>{preview.noRecommendationReason}</Text>
            ) : preview.recommendations.map((group) => (
              <View key={group.documentType} style={styles.recommendation}>
                <Text style={styles.recommendationType}>{getDocumentTypeLabel(group.documentType)}</Text>
                <Text style={styles.recommendationTitle}>{group.selected.title}</Text>
                <Text style={styles.line}>
                  Selected recommendation · {group.selected.source.scope} · Score {group.selected.score?.normalisedScore ?? 0}/100 · Confidence {group.selected.confidence?.level ?? 'LOW'}
                </Text>
                <Text style={styles.muted}>{group.selected.explanation?.summary}</Text>
                <Text style={styles.legal}>legalReviewRequired: true</Text>

                <View style={styles.factors}>
                  {(group.selected.score?.factors ?? []).map((factor) => (
                    <Text key={factor.key} style={styles.factor}>
                      {factor.label}: {factor.dataAvailable ? factor.contribution : 'data unavailable'}
                    </Text>
                  ))}
                </View>

                {group.lowerRanked.map((lower) => (
                  <View key={lower.candidate.id} style={styles.lowerRanked}>
                    <Text style={styles.lowerTitle}>
                      Lower ranked: {lower.candidate.title} · {lower.candidate.source.scope} · {lower.candidate.score?.normalisedScore ?? 0}/100
                    </Text>
                    <Text style={styles.muted}>{lower.primaryReason}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Section>
        </View>
      ) : null}
    </Card>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { ...Typography.bodyStrong, color: Colors.primaryLight },
  sections: { gap: Spacing.md, marginTop: Spacing.md },
  section: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.xs, padding: Spacing.md },
  sectionTitle: { ...Typography.bodyStrong, color: Colors.silver },
  line: { ...Typography.caption, color: Colors.text },
  muted: { ...Typography.caption, color: Colors.textMuted },
  classification: { ...Typography.bodyStrong, color: Colors.primaryLight },
  legal: { ...Typography.caption, color: Colors.warning, fontWeight: '800' },
  loading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  error: { ...Typography.body, color: Colors.danger, marginTop: Spacing.md },
  recommendation: { borderTopColor: Colors.border, borderTopWidth: 1, gap: Spacing.xs, paddingTop: Spacing.md },
  recommendationType: { ...Typography.eyebrow, color: Colors.primaryLight },
  recommendationTitle: { ...Typography.bodyStrong, color: Colors.text },
  factors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  factor: { ...Typography.caption, backgroundColor: Colors.surfaceSoft, borderRadius: Radius.sm, color: Colors.textMuted, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs },
  lowerRanked: { borderLeftColor: Colors.borderStrong, borderLeftWidth: 2, gap: Spacing.xxs, marginTop: Spacing.sm, paddingLeft: Spacing.sm },
  lowerTitle: { ...Typography.caption, color: Colors.silver, fontWeight: '700' },
});
