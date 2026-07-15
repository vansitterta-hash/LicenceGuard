import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
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
    borderColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.borderStrong,
  },
  danger: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
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
    color: Colors.silver,
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
    minHeight: 54,
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
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.82,
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