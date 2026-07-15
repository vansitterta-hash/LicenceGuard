import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Archive,
  BadgeCheck,
  CalendarClock,
  Edit3,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  archiveClient,
  getClientProfileSummary,
} from '../services/clientService';
import {
  getRenewalReadiness,
  type ReadinessIssue,
  type ReadinessStatus,
  type RenewalReadiness,
} from '../services/renewalReadinessService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientProfileSummary } from '../types/client';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ClientProfile'
>;

type ProfileData = {
  client: ClientProfileSummary;
  readiness: RenewalReadiness;
};

export default function ClientProfileScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const { width } = useWindowDimensions();

  const [profile, setProfile] =
    useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  const isCompact = width < 780;

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const [client, readiness] = await Promise.all([
        getClientProfileSummary(route.params.clientId),
        getRenewalReadiness(route.params.clientId),
      ]);

      setProfile({
        client,
        readiness,
      });
    } catch (error) {
      Alert.alert(
        'Unable to load client profile',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.clientId]);

  useEffect(() => {
    void loadProfile();

    const unsubscribe = navigation.addListener(
      'focus',
      () => {
        void loadProfile();
      }
    );

    return unsubscribe;
  }, [loadProfile, navigation]);

  const address = useMemo(() => {
    if (!profile) {
      return '';
    }

    return [
      profile.client.address_line_1,
      profile.client.address_line_2,
      profile.client.suburb,
      profile.client.city,
      profile.client.province,
      profile.client.postal_code,
    ]
      .filter(Boolean)
      .join(', ');
  }, [profile]);

  const confirmArchive = () => {
    if (
      !profile ||
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    Alert.alert(
      'Archive client',
      `Archive ${profile.client.first_name} ${profile.client.surname}? The record will be removed from the active client list but retained in the database.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);

            try {
              await archiveClient(
                profile.client.id,
                dealerProfile.dealerId,
                user.id
              );

              navigation.navigate('Clients');
            } catch (error) {
              Alert.alert(
                'Unable to archive client',
                error instanceof Error
                  ? error.message
                  : 'An unknown error occurred.'
              );
            } finally {
              setArchiving(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !profile) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading client profile...
          </Text>
        </View>
      </Screen>
    );
  }

  const { client, readiness } = profile;
  const readinessVisual = getReadinessVisual(
    readiness.status
  );

  return (
    <Screen maxWidth={1120}>
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <UserRound
              color={Colors.silver}
              size={38}
              strokeWidth={1.8}
            />
          </View>

          <View style={styles.identityContent}>
            <Text style={styles.eyebrow}>
              CLIENT PROFILE
            </Text>

            <Text style={styles.title}>
              {client.first_name} {client.surname}
            </Text>

            <View style={styles.activeBadge}>
              <BadgeCheck
                color={Colors.success}
                size={15}
              />

              <Text style={styles.activeBadgeText}>
                Active client
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.headerActions,
            isCompact ? styles.headerActionsCompact : null,
          ]}
        >
          <Button
            leftIcon={
              <Edit3
                color={Colors.silver}
                size={18}
              />
            }
            onPress={() =>
              navigation.navigate('ClientForm', {
                clientId: client.id,
              })
            }
            title="Edit client"
            variant="secondary"
          />

          <Button
            leftIcon={
              <Archive
                color={Colors.white}
                size={18}
              />
            }
            loading={archiving}
            onPress={confirmArchive}
            title="Archive"
            variant="danger"
          />
        </View>
      </View>

      <Card
        padding="large"
        style={[
          styles.readinessCard,
          {
            borderColor: readinessVisual.borderColor,
          },
        ]}
      >
        <View
          style={[
            styles.readinessHeader,
            isCompact
              ? styles.readinessHeaderCompact
              : null,
          ]}
        >
          <View style={styles.readinessIdentity}>
            <View
              style={[
                styles.readinessIcon,
                {
                  backgroundColor:
                    readinessVisual.backgroundColor,
                },
              ]}
            >
              <readinessVisual.Icon
                color={readinessVisual.color}
                size={28}
              />
            </View>

            <View style={styles.readinessText}>
              <Text style={styles.readinessEyebrow}>
                RENEWAL READINESS
              </Text>

              <Text
                style={[
                  styles.readinessTitle,
                  {
                    color: readinessVisual.color,
                  },
                ]}
              >
                {readinessVisual.label}
              </Text>

              <Text style={styles.nextAction}>
                {readiness.nextAction}
              </Text>
            </View>
          </View>

          <View style={styles.scoreBlock}>
            <Text
              style={[
                styles.scoreValue,
                {
                  color: readinessVisual.color,
                },
              ]}
            >
              {readiness.score}%
            </Text>

            <Text style={styles.scoreLabel}>
              readiness score
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={ShieldCheck}
          label="Competencies"
          value={readiness.counts.competencies}
        />

        <SummaryCard
          icon={FileText}
          label="Firearms"
          value={readiness.counts.firearms}
        />

        <SummaryCard
          icon={CalendarClock}
          label="Licences"
          value={readiness.counts.licences}
        />

        <SummaryCard
          icon={TriangleAlert}
          label="Open renewals"
          value={readiness.counts.openRenewals}
        />

        <SummaryCard
          icon={FileText}
          label="Documents"
          value={readiness.counts.documents}
        />
      </View>

      <View
        style={[
          styles.columns,
          isCompact ? styles.columnsCompact : null,
        ]}
      >
        <Card
          style={styles.columnCard}
          title="Client details"
        >
          <DetailRow
            label="ID number"
            value={client.id_number}
          />

          {client.cellphone ? (
            <IconDetailRow
              icon={Phone}
              label="Cellphone"
              value={client.cellphone}
            />
          ) : null}

          {client.alternate_cellphone ? (
            <IconDetailRow
              icon={Phone}
              label="Alternate cellphone"
              value={client.alternate_cellphone}
            />
          ) : null}

          {client.email ? (
            <IconDetailRow
              icon={Mail}
              label="Email"
              value={client.email}
            />
          ) : null}

          <DetailRow
            label="Preferred contact method"
            value={formatContactChannel(
              client.preferred_contact_channel
            )}
          />

          {address ? (
            <IconDetailRow
              icon={MapPin}
              label="Residential address"
              value={address}
            />
          ) : null}
        </Card>

        <Card
          style={styles.columnCard}
          title="Renewal attention"
        >
          {readiness.issues.length === 0 &&
          readiness.warnings.length === 0 ? (
            <View style={styles.clearState}>
              <ShieldCheck
                color={Colors.success}
                size={34}
              />

              <Text style={styles.clearTitle}>
                No immediate issues
              </Text>

              <Text style={styles.clearText}>
                The current information does not show
                any critical renewal problems.
              </Text>
            </View>
          ) : (
            <>
              {readiness.issues.map((issue) => (
                <IssueRow
                  issue={issue}
                  key={issue.code}
                />
              ))}

              {readiness.warnings.map((warning) => (
                <IssueRow
                  issue={warning}
                  key={warning.code}
                />
              ))}
            </>
          )}
        </Card>
      </View>

      <Card
        subtitle="The four competency categories used by LicenceGuard."
        title="Competencies"
      >
        {readiness.competencies.length === 0 ? (
          <EmptyModuleState
            message="No competencies have been captured for this client."
            title="Competency records required"
          />
        ) : (
          <View style={styles.moduleList}>
            {readiness.competencies.map(
              (competency) => (
                <View
                  key={competency.id}
                  style={styles.moduleRow}
                >
                  <View>
                    <Text style={styles.moduleTitle}>
                      {formatCompetencyCategory(
                        competency.category
                      )}
                    </Text>

                    <Text style={styles.moduleMeta}>
                      Certificate:{' '}
                      {competency.certificateNumber ??
                        'Not recorded'}
                    </Text>
                  </View>

                  <StatusBadge
                    label={formatStatus(
                      competency.status
                    )}
                    status={competency.status}
                  />
                </View>
              )
            )}
          </View>
        )}
      </Card>

      <Card
        subtitle="Firearm licences and their associated competency requirements."
        title="Firearm licences"
      >
        {readiness.licences.length === 0 ? (
          <EmptyModuleState
            message="No firearms or firearm licences have been captured for this client."
            title="Licence records required"
          />
        ) : (
          <View style={styles.moduleList}>
            {readiness.licences.map((licence) => (
              <View
                key={licence.id}
                style={styles.moduleRow}
              >
                <View style={styles.moduleContent}>
                  <Text style={styles.moduleTitle}>
                    {licence.firearmDescription}
                  </Text>

                  <Text style={styles.moduleMeta}>
                    Licence:{' '}
                    {licence.licenceNumber ??
                      'Not recorded'}
                  </Text>

                  <Text style={styles.moduleMeta}>
                    Required competency:{' '}
                    {formatCompetencyCategory(
                      licence.requiredCompetency
                    )}
                  </Text>

                  <Text style={styles.moduleMeta}>
                    Expires: {formatDate(
                      licence.expiryDate
                    )}{' '}
                    · {formatDaysUntilExpiry(
                      licence.daysUntilExpiry
                    )}
                  </Text>
                </View>

                <StatusBadge
                  label={formatLicenceStatus(
                    licence.daysUntilExpiry
                  )}
                  status={
                    licence.daysUntilExpiry < 0
                      ? 'EXPIRED'
                      : licence.daysUntilExpiry <= 120
                        ? 'EXPIRING'
                        : 'VALID'
                  }
                />
              </View>
            ))}
          </View>
        )}
      </Card>

      {client.notes ? (
        <Card title="Dealer or consultant notes">
          <Text style={styles.notesText}>
            {client.notes}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

type SummaryCardProps = {
  icon: typeof ShieldCheck;
  label: string;
  value: number;
};

function SummaryCard({
  icon: Icon,
  label,
  value,
}: SummaryCardProps) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Icon
          color={Colors.primary}
          size={21}
        />
      </View>

      <Text style={styles.summaryValue}>
        {value}
      </Text>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>
        {label}
      </Text>

      <Text style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function IconDetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.iconDetailRow}>
      <Icon
        color={Colors.primary}
        size={18}
      />

      <View style={styles.iconDetailContent}>
        <Text style={styles.detailLabel}>
          {label}
        </Text>

        <Text style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function IssueRow({
  issue,
}: {
  issue: ReadinessIssue;
}) {
  const isCritical =
    issue.severity === 'critical';

  return (
    <View
      style={[
        styles.issueRow,
        isCritical
          ? styles.issueCritical
          : styles.issueWarning,
      ]}
    >
      {isCritical ? (
        <ShieldAlert
          color={Colors.danger}
          size={21}
        />
      ) : (
        <TriangleAlert
          color={Colors.warning}
          size={21}
        />
      )}

      <View style={styles.issueContent}>
        <Text style={styles.issueTitle}>
          {issue.title}
        </Text>

        <Text style={styles.issueDetail}>
          {issue.detail}
        </Text>
      </View>
    </View>
  );
}

function EmptyModuleState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.emptyModule}>
      <FileText
        color={Colors.silverDark}
        size={34}
      />

      <Text style={styles.emptyModuleTitle}>
        {title}
      </Text>

      <Text style={styles.emptyModuleText}>
        {message}
      </Text>
    </View>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  const visual = getStatusBadgeVisual(status);

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor:
            visual.backgroundColor,
          borderColor: visual.borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          {
            color: visual.color,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function getReadinessVisual(
  status: ReadinessStatus
) {
  switch (status) {
    case 'READY':
      return {
        label: 'Renewal ready',
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

    case 'NOT_READY':
      return {
        label: 'Not renewal ready',
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

function getStatusBadgeVisual(status: string) {
  if (
    status === 'VALID' ||
    status === 'RENEWED'
  ) {
    return {
      color: Colors.success,
      borderColor: Colors.success,
      backgroundColor:
        'rgba(40, 199, 111, 0.1)',
    };
  }

  if (
    status === 'EXPIRING' ||
    status === 'NO_EXPIRY_RECORDED'
  ) {
    return {
      color: Colors.warning,
      borderColor: Colors.warning,
      backgroundColor:
        'rgba(255, 193, 7, 0.1)',
    };
  }

  if (status === 'EXPIRED') {
    return {
      color: Colors.danger,
      borderColor: Colors.danger,
      backgroundColor:
        'rgba(229, 57, 53, 0.1)',
    };
  }

  return {
    color: Colors.silver,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceSoft,
  };
}

function formatCompetencyCategory(
  category: string
) {
  switch (category) {
    case 'HANDGUN':
      return 'Handgun';

    case 'RIFLE':
      return 'Rifle';

    case 'SHOTGUN':
      return 'Shotgun';

    case 'SLR':
      return 'Self-loading rifle or carbine';

    default:
      return category;
  }
}

function formatContactChannel(
  channel: string
) {
  switch (channel) {
    case 'WHATSAPP':
      return 'WhatsApp';

    case 'EMAIL':
      return 'Email';

    case 'SMS':
      return 'SMS';

    case 'PHONE':
      return 'Phone call';

    case 'MANUAL':
      return 'Manual follow-up';

    default:
      return channel;
  }
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(dateValue: string) {
  return new Date(
    `${dateValue}T00:00:00`
  ).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDaysUntilExpiry(days: number) {
  if (days < 0) {
    return `expired ${Math.abs(days)} days ago`;
  }

  if (days === 0) {
    return 'expires today';
  }

  return `${days} days remaining`;
}

function formatLicenceStatus(days: number) {
  if (days < 0) {
    return 'Expired';
  }

  if (days <= 90) {
    return 'Urgent';
  }

  if (days <= 120) {
    return 'Renewal due';
  }

  if (days <= 180) {
    return 'Approaching';
  }

  return 'Valid';
}

const styles = StyleSheet.create({
  loadingState: {
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
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  identityContent: {
    flexShrink: 1,
    marginLeft: Spacing.lg,
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
  activeBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor:
      'rgba(40, 199, 111, 0.12)',
    borderRadius: Radius.sm,
    flexDirection: 'row',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.success,
    fontWeight: '800',
    marginLeft: Spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  headerActionsCompact: {
    flexDirection: 'column',
  },
  readinessCard: {
    marginBottom: Spacing.lg,
  },
  readinessHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readinessHeaderCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.xl,
  },
  readinessIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  readinessIcon: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  readinessText: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  readinessEyebrow: {
    ...Typography.eyebrow,
    color: Colors.textMuted,
  },
  readinessTitle: {
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
  scoreValue: {
    ...Typography.metric,
  },
  scoreLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 150,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  summaryValue: {
    ...Typography.metric,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  columnsCompact: {
    flexDirection: 'column',
  },
  columnCard: {
    flex: 1,
  },
  detailRow: {
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    paddingVertical: Spacing.md,
  },
  iconDetailRow: {
    alignItems: 'flex-start',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: Spacing.md,
  },
  iconDetailContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  detailLabel: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  detailValue: {
    ...Typography.body,
    color: Colors.text,
    marginTop: Spacing.xxs,
  },
  clearState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  clearTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  clearText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  issueRow: {
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  issueCritical: {
    backgroundColor:
      'rgba(229, 57, 53, 0.08)',
    borderColor: Colors.danger,
  },
  issueWarning: {
    backgroundColor:
      'rgba(255, 193, 7, 0.08)',
    borderColor: Colors.warning,
  },
  issueContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  issueTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  issueDetail: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  moduleList: {
    gap: Spacing.md,
  },
  moduleRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  moduleContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  moduleTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  moduleMeta: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  emptyModule: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyModuleTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  emptyModuleText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    maxWidth: 520,
    textAlign: 'center',
  },
  statusBadge: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '800',
  },
  notesText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
});