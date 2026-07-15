import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  FileText,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';

import Card from '../Card';
import type {
  ApplicationReadinessStatus,
  ClientApplicationSummary,
} from '../../engines/applicationEngine';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/radius';
import { Spacing } from '../../theme/spacing';
import { Typography } from '../../theme/typography';

type ApplicationReadinessCardProps = {
  summary: ClientApplicationSummary;
};

export default function ApplicationReadinessCard({
  summary,
}: ApplicationReadinessCardProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 780;

  const visual = getReadinessVisual(summary.status);

  return (
    <Card
      padding="large"
      style={[
        styles.card,
        {
          borderColor: visual.borderColor,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.identity}>
          <View
            style={[
              styles.icon,
              {
                backgroundColor: visual.backgroundColor,
              },
            ]}
          >
            <visual.Icon
              color={visual.color}
              size={28}
            />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.eyebrow}>
              APPLICATION READINESS
            </Text>

            <Text
              style={[
                styles.title,
                {
                  color: visual.color,
                },
              ]}
            >
              {visual.label}
            </Text>

            <Text style={styles.nextAction}>
              {summary.nextAction}
            </Text>
          </View>
        </View>

        <View style={styles.scoreBlock}>
          <Text
            style={[
              styles.score,
              {
                color: visual.color,
              },
            ]}
          >
            {summary.score}%
          </Text>

          <Text style={styles.scoreLabel}>
            readiness score
          </Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric
          label="Competencies"
          value={summary.counts.competencies}
        />
        <Metric
          label="Firearms"
          value={summary.counts.firearms}
        />
        <Metric
          label="Issued licences"
          value={summary.counts.issuedLicences}
        />
        <Metric
          label="First licence candidates"
          value={summary.counts.firstLicenceCandidates}
        />
        <Metric
          label="Open applications"
          value={summary.counts.openApplications}
        />
        <Metric
          label="Documents"
          value={summary.counts.documents}
        />
      </View>
    </Card>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function getReadinessVisual(
  status: ApplicationReadinessStatus
) {
  switch (status) {
    case 'READY':
      return {
        label: 'Ready',
        color: Colors.success,
        borderColor: Colors.success,
        backgroundColor:
          'rgba(40, 199, 111, 0.12)',
        Icon: ShieldCheck,
      };

    case 'ACTION_REQUIRED':
      return {
        label: 'Action required',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.12)',
        Icon: TriangleAlert,
      };

    case 'BLOCKED':
      return {
        label: 'Blocked',
        color: Colors.danger,
        borderColor: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.12)',
        Icon: ShieldAlert,
      };

    default:
      return {
        label: 'Insufficient data',
        color: Colors.silver,
        borderColor: Colors.borderStrong,
        backgroundColor: Colors.surfaceSoft,
        Icon: FileText,
      };
  }
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.xl,
  },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  textBlock: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.textMuted,
  },
  title: {
    ...Typography.sectionTitle,
    marginTop: Spacing.xxs,
  },
  nextAction: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  scoreBlock: {
    alignItems: 'flex-end',
    marginLeft: Spacing.xl,
  },
  score: {
    ...Typography.metric,
  },
  scoreLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  metric: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 140,
    padding: Spacing.md,
  },
  metricValue: {
    ...Typography.metric,
    color: Colors.white,
  },
  metricLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
});