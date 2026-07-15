import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Archive,
  BadgeCheck,
  Edit3,
  UserRound,
} from 'lucide-react-native';

import Button from '../Button';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/radius';
import { Spacing } from '../../theme/spacing';
import { Typography } from '../../theme/typography';

type ClientHeaderProps = {
  firstName: string;
  surname: string;
  archiving?: boolean;
  onEdit: () => void;
  onArchive: () => void;
};

export default function ClientHeader({
  firstName,
  surname,
  archiving = false,
  onEdit,
  onArchive,
}: ClientHeaderProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 780;

  return (
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
            {firstName} {surname}
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
          styles.actions,
          isCompact ? styles.actionsCompact : null,
        ]}
      >
        <Button
          leftIcon={
            <Edit3
              color={Colors.silver}
              size={18}
            />
          }
          onPress={onEdit}
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
          onPress={onArchive}
          title="Archive"
          variant="danger"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexShrink: 1,
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
    backgroundColor: 'rgba(40, 199, 111, 0.12)',
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginLeft: Spacing.lg,
  },
  actionsCompact: {
    flexDirection: 'column',
    marginLeft: 0,
  },
});