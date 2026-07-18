import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Edit3,
  FileOutput,
  FolderOpen,
  Printer,
  RefreshCw,
  TriangleAlert,
  Upload,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  buildApplicationPackManifest,
  prepareApplicationPack,
  printApplicationPackManifest,
} from '../services/applicationPackService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type {
  ApplicationPackItem,
  ApplicationPackManifest,
} from '../types/applicationPack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ApplicationPackGenerator'
>;

export default function ApplicationPackGeneratorScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const { width } = useWindowDimensions();
  const [manifest, setManifest] =
    useState<ApplicationPackManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);

  const compact = width < 820;

  const loadManifest = useCallback(async () => {
    setLoading(true);

    try {
      const result =
        await buildApplicationPackManifest(
          route.params.clientId,
          route.params.applicationCaseId
        );

      setManifest(result);
    } catch (error) {
      Alert.alert(
        'Unable to build application pack',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    route.params.applicationCaseId,
    route.params.clientId,
  ]);

  useEffect(() => {
    void loadManifest();

    const unsubscribe = navigation.addListener(
      'focus',
      () => {
        void loadManifest();
      }
    );

    return unsubscribe;
  }, [loadManifest, navigation]);

  const firstBlockingItem = useMemo(
    () =>
      manifest?.items.find(
        (item) =>
          item.required &&
          item.documentType &&
          item.state !== 'COMPLETE'
      ) ?? null,
    [manifest]
  );

  const prepare = async () => {
    if (
      !manifest ||
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    setPreparing(true);

    try {
      const result = await prepareApplicationPack(
        dealerProfile.dealerId,
        user.id,
        route.params.clientId,
        route.params.applicationCaseId
      );

      setManifest(result.manifest);

      Alert.alert(
        result.manifest.packState === 'READY'
          ? 'Application pack ready'
          : 'Pack preparation started',
        result.manifest.packState === 'READY'
          ? 'All blocking requirements are complete. The case has been marked Ready for Submission.'
          : 'The case has been marked Pack in Preparation. Resolve the outstanding items shown in the manifest.'
      );
    } catch (error) {
      Alert.alert(
        'Unable to prepare application pack',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setPreparing(false);
    }
  };

  const printManifest = () => {
    if (!manifest) {
      return;
    }

    try {
      printApplicationPackManifest(manifest);
    } catch (error) {
      Alert.alert(
        'Unable to print manifest',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    }
  };

  if (loading || !manifest) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />
          <Text style={styles.loadingText}>
            Building ordered application pack...
          </Text>
        </View>
      </Screen>
    );
  }

  const visual = getPackVisual(
    manifest.packState
  );

  return (
    <Screen maxWidth={1180}>
      <View
        style={[
          styles.header,
          compact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>
            APPLICATION PACK ENGINE
          </Text>
          <Text style={styles.title}>
            {manifest.subject}
          </Text>
          <Text style={styles.subtitle}>
            {manifest.clientName} •{' '}
            {manifest.applicationTypeLabel}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Button
            leftIcon={
              <RefreshCw
                color={Colors.silver}
                size={18}
              />
            }
            onPress={() => void loadManifest()}
            title="Rebuild"
            variant="secondary"
          />
          <Button
            leftIcon={
              <Edit3
                color={Colors.white}
                size={18}
              />
            }
            onPress={() =>
              navigation.navigate(
                'ApplicationCaseForm',
                {
                  clientId:
                    route.params.clientId,
                  applicationCaseId:
                    route.params
                      .applicationCaseId,
                }
              )
            }
            title="Edit application"
          />
        </View>
      </View>

      <Card
        padding="large"
        style={[
          styles.decisionCard,
          { borderColor: visual.color },
        ]}
      >
        <View
          style={[
            styles.decisionRow,
            compact
              ? styles.decisionRowCompact
              : null,
          ]}
        >
          <View
            style={[
              styles.decisionIcon,
              {
                backgroundColor:
                  visual.backgroundColor,
              },
            ]}
          >
            <visual.Icon
              color={visual.color}
              size={34}
            />
          </View>

          <View style={styles.decisionContent}>
            <Text
              style={[
                styles.decisionState,
                { color: visual.color },
              ]}
            >
              {visual.label}
            </Text>
            <Text style={styles.decisionTitle}>
              {manifest.readinessScore}% ready
            </Text>
            <Text style={styles.decisionText}>
              {visual.description}
            </Text>
          </View>

          <View style={styles.engineActions}>
            <Button
              leftIcon={
                <FileOutput
                  color={Colors.white}
                  size={18}
                />
              }
              loading={preparing}
              onPress={() => void prepare()}
              title={
                manifest.packState === 'READY'
                  ? 'Finalise pack'
                  : 'Start pack preparation'
              }
            />
            <Button
              leftIcon={
                <ClipboardCheck
                  color={Colors.white}
                  size={18}
                />
              }
              onPress={() =>
                navigation.navigate(
                  'ApplicationAutofill',
                  {
                    clientId:
                      route.params.clientId,
                    applicationCaseId:
                      route.params
                        .applicationCaseId,
                  }
                )
              }
              title="AutoFill SAPS forms"
            />
            <Button
              leftIcon={
                <Printer
                  color={Colors.silver}
                  size={18}
                />
              }
              onPress={printManifest}
              title="Print manifest"
              variant="secondary"
            />
          </View>
        </View>
      </Card>

      <View style={styles.metrics}>
        <Metric
          label="Pack items"
          value={manifest.totalItems}
        />
        <Metric
          label="Complete"
          value={manifest.completeItems}
        />
        <Metric
          label="Missing / expired"
          value={manifest.missingItems}
        />
        <Metric
          label="Verification warnings"
          value={manifest.warningItems}
        />
      </View>

      {manifest.blockingReasons.length > 0 ? (
        <Card
          subtitle="These items prevent the application from being submission-ready."
          title="Blocking reasons"
        >
          <View style={styles.blockerList}>
            {manifest.blockingReasons.map(
              (reason) => (
                <View
                  key={reason}
                  style={styles.blocker}
                >
                  <TriangleAlert
                    color={Colors.danger}
                    size={18}
                  />
                  <Text style={styles.blockerText}>
                    {reason}
                  </Text>
                </View>
              )
            )}
          </View>

          {firstBlockingItem ? (
            <Button
              leftIcon={
                <Upload
                  color={Colors.white}
                  size={18}
                />
              }
              onPress={() =>
                navigation.navigate(
                  'DocumentLibrary',
                  {
                    clientId:
                      route.params.clientId,
                    applicationCaseId:
                      route.params
                        .applicationCaseId,
                    documentType:
                      firstBlockingItem.documentType ??
                      undefined,
                    openUpload: true,
                  }
                )
              }
              style={styles.blockerButton}
              title="Resolve first blocking item"
            />
          ) : null}
        </Card>
      ) : null}

      <Card
        subtitle="Documents are arranged in the exact order recorded by the readiness engine."
        title="Submission manifest"
      >
        <View style={styles.itemList}>
          {manifest.items.map((item) => (
            <PackItemRow
              item={item}
              key={item.key}
              onPress={() => {
                if (!item.documentType) {
                  return;
                }

                navigation.navigate(
                  'DocumentLibrary',
                  {
                    clientId:
                      route.params.clientId,
                    applicationCaseId:
                      route.params
                        .applicationCaseId,
                    documentType:
                      item.documentType,
                    openUpload:
                      item.state !== 'COMPLETE',
                  }
                );
              }}
            />
          ))}
        </View>
      </Card>
    </Screen>
  );
}

function PackItemRow({
  item,
  onPress,
}: {
  item: ApplicationPackItem;
  onPress: () => void;
}) {
  const visual = getItemVisual(item.state);

  return (
    <Pressable
      disabled={!item.documentType}
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemRow,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.order}>
        <Text style={styles.orderText}>
          {item.order}
        </Text>
      </View>

      <View style={styles.itemContent}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemTitle}>
            {item.label}
          </Text>
          <Text
            style={[
              styles.requirementType,
              item.required
                ? styles.required
                : null,
            ]}
          >
            {item.required
              ? 'Required'
              : 'Recommended'}
          </Text>
        </View>

        <Text style={styles.itemDetail}>
          {item.detail}
        </Text>

        {item.document ? (
          <View style={styles.documentLine}>
            <FolderOpen
              color={Colors.silverDark}
              size={14}
            />
            <Text style={styles.documentName}>
              {item.document.document_name}
              {item.document.is_verified
                ? ' • Verified'
                : ' • Not verified'}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.itemState,
          {
            borderColor: visual.color,
            backgroundColor:
              visual.backgroundColor,
          },
        ]}
      >
        <visual.Icon
          color={visual.color}
          size={16}
        />
        <Text
          style={[
            styles.itemStateText,
            { color: visual.color },
          ]}
        >
          {visual.label}
        </Text>
      </View>
    </Pressable>
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
    <Card style={styles.metricCard}>
      <Text style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </Card>
  );
}

function getPackVisual(
  state: ApplicationPackManifest['packState']
) {
  if (state === 'READY') {
    return {
      label: 'Pack ready',
      description:
        'All blocking requirements are complete. Finalising the pack marks the application Ready for Submission.',
      color: Colors.success,
      backgroundColor:
        'rgba(40, 199, 111, 0.10)',
      Icon: CheckCircle2,
    };
  }

  if (state === 'ACTION_REQUIRED') {
    return {
      label: 'Verification required',
      description:
        'All required documents are present, but verification must be completed before final submission.',
      color: Colors.warning,
      backgroundColor:
        'rgba(255, 193, 7, 0.10)',
      Icon: CircleAlert,
    };
  }

  return {
    label: 'Pack blocked',
    description:
      'Required documents are missing or expired. Start preparation and resolve each blocking item.',
    color: Colors.danger,
    backgroundColor:
      'rgba(229, 57, 53, 0.10)',
    Icon: TriangleAlert,
  };
}

function getItemVisual(
  state: ApplicationPackItem['state']
) {
  if (state === 'COMPLETE') {
    return {
      label: 'Complete',
      color: Colors.success,
      backgroundColor:
        'rgba(40, 199, 111, 0.10)',
      Icon: CheckCircle2,
    };
  }

  if (state === 'UNVERIFIED') {
    return {
      label: 'Verify',
      color: Colors.warning,
      backgroundColor:
        'rgba(255, 193, 7, 0.10)',
      Icon: CircleAlert,
    };
  }

  return {
    label:
      state === 'EXPIRED'
        ? 'Expired'
        : 'Missing',
    color: Colors.danger,
    backgroundColor:
      'rgba(229, 57, 53, 0.10)',
    Icon: TriangleAlert,
  };
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.lg,
  },
  headerContent: {
    flex: 1,
    marginRight: Spacing.xl,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.primary,
  },
  title: {
    ...Typography.pageTitle,
    color: Colors.white,
    marginTop: Spacing.xxs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  decisionCard: {
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  decisionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  decisionRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  decisionIcon: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  decisionContent: {
    flex: 1,
  },
  decisionState: {
    ...Typography.eyebrow,
  },
  decisionTitle: {
    ...Typography.sectionTitle,
    color: Colors.white,
    marginTop: Spacing.xxs,
  },
  decisionText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  engineActions: {
    gap: Spacing.sm,
    minWidth: 210,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 170,
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
  blockerList: {
    gap: Spacing.sm,
  },
  blocker: {
    alignItems: 'center',
    backgroundColor:
      'rgba(229, 57, 53, 0.08)',
    borderColor: Colors.danger,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  blockerText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  blockerButton: {
    marginTop: Spacing.lg,
  },
  itemList: {
    gap: Spacing.sm,
  },
  itemRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
  order: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  orderText: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
  },
  itemContent: {
    flex: 1,
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  itemTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  requirementType: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  required: {
    color: Colors.primary,
  },
  itemDetail: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  documentLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  documentName: {
    ...Typography.caption,
    color: Colors.silver,
    flex: 1,
  },
  itemState: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  itemStateText: {
    ...Typography.caption,
    fontWeight: '800',
  },
});