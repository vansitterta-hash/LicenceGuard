import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost';

export type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  fullWidth = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isMetallic =
    variant === 'primary' || variant === 'danger';

  return (
    <Pressable
      {...pressableProps}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth ? styles.fullWidth : null,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {isMetallic ? (
        <>
          <View pointerEvents="none" style={styles.metallicUpperBand} />
          <View pointerEvents="none" style={styles.metallicReflection} />
          <View pointerEvents="none" style={styles.metallicLowerBand} />
          <View pointerEvents="none" style={styles.metallicBottomEdge} />
        </>
      ) : null}

      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger'
              ? Colors.white
              : Colors.silver
          }
          size="small"
        />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}

          <Text
            style={[
              styles.title,
              titleVariantStyles[variant],
              leftIcon ? styles.titleWithLeftIcon : null,
              rightIcon ? styles.titleWithRightIcon : null,
            ]}
          >
            {title}
          </Text>

          {rightIcon ? <>{rightIcon}</> : null}
        </>
      )}
    </Pressable>
  );
}

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
    shadowColor: Colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.36,
    shadowRadius: 10,
    elevation: 5,
  },
  secondary: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.borderMetal,
  },
  danger: {
    backgroundColor: Colors.danger,
    borderColor: Colors.primaryLight,
    shadowColor: Colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.34,
    shadowRadius: 9,
    elevation: 4,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: Colors.border,
  },
});

const titleVariantStyles = StyleSheet.create({
  primary: {
    color: Colors.white,
  },
  secondary: {
    color: Colors.silverLight,
  },
  danger: {
    color: Colors.white,
  },
  ghost: {
    color: Colors.silver,
  },
});

const sizeStyles = StyleSheet.create({
  small: {
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  medium: {
    minHeight: 46,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  large: {
    minHeight: 52,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  metallicUpperBand: {
    backgroundColor: Colors.primaryLight,
    height: '33%',
    left: 0,
    opacity: 0.34,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  metallicReflection: {
    backgroundColor: Colors.primaryHighlight,
    height: 1,
    left: 12,
    opacity: 0.95,
    position: 'absolute',
    right: 12,
    top: 2,
  },
  metallicLowerBand: {
    backgroundColor: Colors.primaryDark,
    bottom: 0,
    height: '30%',
    left: 0,
    opacity: 0.38,
    position: 'absolute',
    right: 0,
  },
  metallicBottomEdge: {
    backgroundColor: Colors.primaryDeep,
    bottom: 1,
    height: 2,
    left: 10,
    opacity: 0.95,
    position: 'absolute',
    right: 10,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.55,
  },
  title: {
    ...Typography.button,
    textAlign: 'center',
  },
  titleWithLeftIcon: {
    marginLeft: Spacing.sm,
  },
  titleWithRightIcon: {
    marginRight: Spacing.sm,
  },
});
