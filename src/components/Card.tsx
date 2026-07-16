import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';

type CardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
  style?: StyleProp<ViewStyle>;
};

export default function Card({
  children,
  title,
  subtitle,
  headerAction,
  padding = 'medium',
  style,
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || headerAction);

  return (
    <View style={[styles.card, paddingStyles[padding], style]}>
      <View pointerEvents="none" style={styles.topHighlight} />

      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.title}>{title}</Text> : null}

            {subtitle ? (
              <Text style={styles.subtitle}>{subtitle}</Text>
            ) : null}
          </View>

          {headerAction ? (
            <View style={styles.headerAction}>{headerAction}</View>
          ) : null}
        </View>
      ) : null}

      <View style={hasHeader ? styles.contentAfterHeader : null}>
        {children}
      </View>
    </View>
  );
}

const paddingStyles = StyleSheet.create({
  none: {
    padding: Spacing.none,
  },
  small: {
    padding: Spacing.md,
  },
  medium: {
    padding: Spacing.lg,
  },
  large: {
    padding: Spacing.xxl,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 2,
  },
  topHighlight: {
    backgroundColor: Colors.gunmetalLight,
    height: 1,
    left: 18,
    opacity: 0.48,
    position: 'absolute',
    right: 18,
    top: 0,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  headerAction: {
    marginLeft: Spacing.md,
  },
  title: {
    ...Typography.cardTitle,
    color: Colors.silverLight,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  contentAfterHeader: {
    marginTop: Spacing.lg,
  },
});
