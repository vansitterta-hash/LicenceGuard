import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getLocalIntelligenceFeatureFlags } from '../../intelligence/featureFlags';
import { previewProactiveRenewals } from '../../services/proactiveRenewalService';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/radius';
import { Spacing } from '../../theme/spacing';
import { Typography } from '../../theme/typography';
import type {
  ProactiveRenewalPreview,
  RenewalEligibilityResult,
  RenewalPreviewItem,
} from '../../types/proactiveRenewal';
import Button from '../Button';
import Card from '../Card';

type Props = { clientId: string };

function ItemRow({ item }: { item: RenewalPreviewItem }) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemLabel}>{item.label}</Text>
      <Text style={styles.itemState}>{item.state.replaceAll('_', ' ')}</Text>
      <Text style={styles.itemDetail}>{item.detail}</Text>
    </View>
  );
}

function Candidate({ item }: { item: RenewalEligibilityResult }) {
  return (
    <View style={styles.candidate}>
      <Text style={styles.candidateTitle}>{item.description}</Text>
      <Text style={styles.meta}>
        {item.applicationType.replaceAll('_', ' ')} · expires {item.expiryDate ?? 'not recorded'} ·{' '}
        {item.daysUntilExpiry === null ? 'unknown time remaining' : `${item.daysUntilExpiry} days remaining`}
      </Text>

      <Text style={styles.sectionLabel}>AUTOMATICALLY PREPARED</Text>
      {item.automaticallyPreparedPreview.length > 0 ? item.automaticallyPreparedPreview.map((entry) => (
        <ItemRow item={entry} key={entry.key} />
      )) : <Text style={styles.emptyText}>No verified reusable documents were found.</Text>}

      <Text style={styles.sectionLabel}>NEEDS REVIEW</Text>
      {item.needsReviewPreview.map((entry) => <ItemRow item={entry} key={entry.key} />)}

      <Text style={styles.sectionLabel}>NOTIFICATION PREVIEW</Text>
      <Text style={styles.notification}>{item.notificationPreview}</Text>
      <Text style={styles.keyText}>Deterministic operation key: {item.idempotencyKey.value}</Text>
    </View>
  );
}

export default function ProactiveRenewalPreviewPanel({ clientId }: Props) {
  const enabled = getLocalIntelligenceFeatureFlags().PROACTIVE_RENEWALS;
  const [preview, setPreview] = useState<ProactiveRenewalPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  const loadPreview = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewProactiveRenewals(clientId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to calculate proactive renewals.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="Proactive renewals"
      subtitle="Feature-flagged preview using current client records. No application is changed."
    >
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>PREVIEW ONLY</Text>
        <Text style={styles.noticeText}>
          LicenceGuard has identified this upcoming renewal and can prepare the application after your confirmation.
          No application or draft has been created by this preview.
        </Text>
      </View>

      <Button
        disabled={loading}
        onPress={loadPreview}
        title={preview ? 'Refresh renewal preview' : 'Preview proactive renewals'}
        variant="secondary"
      />
      {loading ? <ActivityIndicator color={Colors.primaryLight} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {preview ? (
        <View style={styles.results}>
          <Text style={styles.summary}>
            {preview.eligible.length} eligible · {preview.blocked.length} not eligible · {preview.renewalWindowDays}-day window
          </Text>

          {preview.eligible.map((item) => <Candidate item={item} key={`${item.subjectType}:${item.subjectId}`} />)}

          {preview.blocked.length > 0 ? (
            <View style={styles.blockedSection}>
              <Text style={styles.sectionLabel}>NOT ELIGIBLE</Text>
              {preview.blocked.map((item) => (
                <View key={`${item.subjectType}:${item.subjectId}`} style={styles.blockedRow}>
                  <Text style={styles.itemLabel}>{item.description}</Text>
                  <Text style={styles.itemDetail}>{item.blockingReason}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Button disabled title="Prepare draft renewal" />
          <Text style={styles.blocker}>{preview.prepareModeBlocker}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.md },
  noticeTitle: { ...Typography.caption, color: Colors.primaryLight, fontWeight: '700' },
  noticeText: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xxs },
  loader: { marginTop: Spacing.md },
  error: { ...Typography.body, color: Colors.danger, marginTop: Spacing.md },
  results: { gap: Spacing.lg, marginTop: Spacing.lg },
  summary: { ...Typography.body, color: Colors.silverLight, fontWeight: '600' },
  candidate: { borderColor: Colors.border, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm, padding: Spacing.lg },
  candidateTitle: { ...Typography.cardTitle, color: Colors.silverLight },
  meta: { ...Typography.caption, color: Colors.textMuted },
  sectionLabel: { ...Typography.caption, color: Colors.primaryLight, fontWeight: '700', marginTop: Spacing.sm },
  itemRow: { borderLeftColor: Colors.borderMetal, borderLeftWidth: 2, paddingLeft: Spacing.md },
  itemLabel: { ...Typography.body, color: Colors.silverLight, fontWeight: '600' },
  itemState: { ...Typography.caption, color: Colors.primaryLight },
  itemDetail: { ...Typography.caption, color: Colors.textMuted },
  emptyText: { ...Typography.caption, color: Colors.textMuted },
  notification: { ...Typography.body, color: Colors.silver },
  keyText: { ...Typography.caption, color: Colors.textMuted },
  blockedSection: { gap: Spacing.sm },
  blockedRow: { backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, padding: Spacing.md },
  blocker: { ...Typography.caption, color: Colors.warning },
});
