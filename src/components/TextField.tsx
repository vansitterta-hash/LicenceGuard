import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function TextField({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  required = false,
  editable = true,
  multiline = false,
  containerStyle,
  style,
  ...inputProps
}: TextFieldProps) {
  const supportingText = error || helperText;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          multiline ? styles.multilineWrapper : null,
          error ? styles.inputWrapperError : null,
          !editable ? styles.inputWrapperDisabled : null,
        ]}
      >
        {leftIcon ? (
          <View style={styles.leftIcon}>{leftIcon}</View>
        ) : null}

        <TextInput
          {...inputProps}
          editable={editable}
          multiline={multiline}
          placeholderTextColor={Colors.textMuted}
          style={[
            styles.input,
            multiline ? styles.multilineInput : null,
            style,
          ]}
          textAlignVertical={multiline ? 'top' : 'center'}
        />

        {rightIcon ? (
          <View style={styles.rightIcon}>{rightIcon}</View>
        ) : null}
      </View>

      {supportingText ? (
        <Text
          style={[
            styles.supportingText,
            error ? styles.errorText : null,
          ]}
        >
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    ...Typography.label,
    color: Colors.silver,
    marginBottom: Spacing.sm,
  },
  required: {
    color: Colors.primary,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  multilineWrapper: {
    alignItems: 'flex-start',
    minHeight: 120,
  },
  inputWrapperError: {
    borderColor: Colors.danger,
  },
  inputWrapperDisabled: {
    opacity: 0.58,
  },
  leftIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  rightIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  input: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.md,
  },
  multilineInput: {
    minHeight: 118,
    paddingTop: Spacing.md,
  },
  supportingText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  errorText: {
    color: Colors.danger,
  },
});