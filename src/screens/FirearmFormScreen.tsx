import {
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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarDays,
  FileBadge,
  Save,
  ShieldCheck,
  Target,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { getClient } from '../services/clientService';
import {
  createFirearm,
  getFirearm,
  updateFirearm,
} from '../services/firearmService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import {
  COMPETENCY_CATEGORIES,
  type CompetencyCategory,
} from '../types/competency';
import {
  FIREARM_TYPES,
  LICENCE_STATUSES,
  type FirearmFormValues,
  type FirearmType,
  type LicenceStatus,
} from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'FirearmForm'
>;

const EMPTY_FORM: FirearmFormValues = {
  make: '',
  model: '',
  calibre: '',
  serialNumber: '',
  firearmType: 'PISTOL',
  requiredCompetency: 'HANDGUN',
  competencyOverrideReason: '',
  firearmNotes: '',
  licenceNumber: '',
  licenceSection: '',
  licenceIssueDate: '',
  licenceExpiryDate: '',
  licenceStatus: 'VALID',
  licenceNotes: '',
};

export default function FirearmFormScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();

  const [client, setClient] =
    useState<ClientRecord | null>(null);
  const [values, setValues] =
    useState<FirearmFormValues>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<
    Partial<
      Record<
        | 'make'
        | 'calibre'
        | 'serialNumber'
        | 'licenceIssueDate'
        | 'licenceExpiryDate',
        string
      >
    >
  >({});

  const isEditing = Boolean(route.params.firearmId);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      try {
        const clientRecord = await getClient(
          route.params.clientId
        );

        setClient(clientRecord);

        if (route.params.firearmId) {
          const firearm = await getFirearm(
            route.params.firearmId
          );

          setValues({
            make: firearm.make,
            model: firearm.model ?? '',
            calibre: firearm.calibre,
            serialNumber: firearm.serial_number,
            firearmType: firearm.firearm_type,
            requiredCompetency:
              firearm.required_competency,
            competencyOverrideReason:
              firearm.competency_override_reason ?? '',
            firearmNotes: firearm.notes ?? '',
            licenceNumber:
              firearm.licence?.licence_number ?? '',
            licenceSection:
              firearm.licence?.licence_section ?? '',
            licenceIssueDate:
              firearm.licence?.issue_date ?? '',
            licenceExpiryDate:
              firearm.licence?.expiry_date ?? '',
            licenceStatus:
              firearm.licence?.status ?? 'VALID',
            licenceNotes:
              firearm.licence?.notes ?? '',
          });
        }
      } catch (error) {
        Alert.alert(
          'Unable to load firearm',
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.'
        );
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [
    route.params.clientId,
    route.params.firearmId,
  ]);

  const selectedFirearmType = useMemo(
    () =>
      FIREARM_TYPES.find(
        (item) =>
          item.value === values.firearmType
      ) ?? FIREARM_TYPES[0],
    [values.firearmType]
  );

  const updateValue = <Key extends keyof FirearmFormValues>(
    key: Key,
    value: FirearmFormValues[Key]
  ) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));

    if (
      key === 'make' ||
      key === 'calibre' ||
      key === 'serialNumber' ||
      key === 'licenceIssueDate' ||
      key === 'licenceExpiryDate'
    ) {
      setErrors((current) => ({
        ...current,
        [key]: undefined,
      }));
    }
  };

  const selectFirearmType = (
    firearmType: FirearmType,
    competency: CompetencyCategory
  ) => {
    setValues((current) => ({
      ...current,
      firearmType,
      requiredCompetency: competency,
    }));
  };

  const hasLicenceValues = Boolean(
    values.licenceNumber.trim() ||
      values.licenceSection.trim() ||
      values.licenceIssueDate.trim() ||
      values.licenceExpiryDate.trim() ||
      values.licenceNotes.trim()
  );

  const validate = (): boolean => {
    const nextErrors: typeof errors = {};

    if (!values.make.trim()) {
      nextErrors.make = 'Enter the firearm make.';
    }

    if (!values.calibre.trim()) {
      nextErrors.calibre = 'Enter the calibre.';
    }

    if (!values.serialNumber.trim()) {
      nextErrors.serialNumber =
        'Enter the serial number.';
    }

    if (
      values.licenceIssueDate.trim() &&
      !isValidDate(values.licenceIssueDate)
    ) {
      nextErrors.licenceIssueDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      values.licenceExpiryDate.trim() &&
      !isValidDate(values.licenceExpiryDate)
    ) {
      nextErrors.licenceExpiryDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      hasLicenceValues &&
      !values.licenceExpiryDate.trim()
    ) {
      nextErrors.licenceExpiryDate =
        'An expiry date is required when licence information is captured.';
    }

    if (
      values.licenceIssueDate.trim() &&
      values.licenceExpiryDate.trim() &&
      isValidDate(values.licenceIssueDate) &&
      isValidDate(values.licenceExpiryDate) &&
      values.licenceExpiryDate <
        values.licenceIssueDate
    ) {
      nextErrors.licenceExpiryDate =
        'Expiry date cannot be before the issue date.';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const saveFirearm = async () => {
    if (
      !validate() ||
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    setSaving(true);

    try {
      if (route.params.firearmId) {
        await updateFirearm(
          route.params.firearmId,
          dealerProfile.dealerId,
          route.params.clientId,
          user.id,
          values
        );
      } else {
        await createFirearm(
          dealerProfile.dealerId,
          route.params.clientId,
          user.id,
          values
        );
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert(
        isEditing
          ? 'Unable to update firearm'
          : 'Unable to create firearm',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !client) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading firearm...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      keyboardAvoiding
      maxWidth={960}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {isEditing
            ? 'EDIT FIREARM'
            : 'ADD FIREARM'}
        </Text>

        <Text style={styles.title}>
          {client.first_name} {client.surname}
        </Text>

        <Text style={styles.subtitle}>
          Capture the firearm and its current licence
          information. Licence details may be added
          later when the firearm does not yet have an
          issued licence.
        </Text>
      </View>

      <Card
        subtitle="Select the firearm type. LicenceGuard will assign the usual matching competency category."
        title="Firearm type"
      >
        <View style={styles.optionGrid}>
          {FIREARM_TYPES.map((item) => {
            const selected =
              values.firearmType === item.value;

            return (
              <Pressable
                key={item.value}
                onPress={() =>
                  selectFirearmType(
                    item.value,
                    item.requiredCompetency
                  )
                }
                style={({ pressed }) => [
                  styles.option,
                  selected
                    ? styles.optionSelected
                    : null,
                  pressed
                    ? styles.optionPressed
                    : null,
                ]}
              >
                <Target
                  color={
                    selected
                      ? Colors.white
                      : Colors.primary
                  }
                  size={20}
                />

                <Text
                  style={[
                    styles.optionTitle,
                    selected
                      ? styles.optionTitleSelected
                      : null,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.selectedHint}>
          Selected: {selectedFirearmType.label}
        </Text>
      </Card>

      <Card title="Firearm details">
        <View style={styles.formGap}>
          <View style={styles.twoColumnRow}>
            <TextField
              autoCapitalize="words"
              containerStyle={styles.flexField}
              error={errors.make}
              label="Make"
              onChangeText={(value) =>
                updateValue('make', value)
              }
              placeholder="Example: Glock"
              required
              value={values.make}
            />

            <TextField
              autoCapitalize="words"
              containerStyle={styles.flexField}
              label="Model"
              onChangeText={(value) =>
                updateValue('model', value)
              }
              placeholder="Example: 19"
              value={values.model}
            />
          </View>

          <View style={styles.twoColumnRow}>
            <TextField
              autoCapitalize="characters"
              containerStyle={styles.flexField}
              error={errors.calibre}
              label="Calibre"
              onChangeText={(value) =>
                updateValue('calibre', value)
              }
              placeholder="Example: 9mm P"
              required
              value={values.calibre}
            />

            <TextField
              autoCapitalize="characters"
              containerStyle={styles.flexField}
              error={errors.serialNumber}
              label="Serial number"
              onChangeText={(value) =>
                updateValue(
                  'serialNumber',
                  value
                )
              }
              placeholder="Enter serial number"
              required
              value={values.serialNumber}
            />
          </View>

          <Text style={styles.fieldLabel}>
            Required competency
          </Text>

          <View style={styles.optionGrid}>
            {COMPETENCY_CATEGORIES.map(
              (category) => {
                const selected =
                  values.requiredCompetency ===
                  category.value;

                return (
                  <Pressable
                    key={category.value}
                    onPress={() =>
                      updateValue(
                        'requiredCompetency',
                        category.value
                      )
                    }
                    style={({ pressed }) => [
                      styles.option,
                      selected
                        ? styles.optionSelected
                        : null,
                      pressed
                        ? styles.optionPressed
                        : null,
                    ]}
                  >
                    <ShieldCheck
                      color={
                        selected
                          ? Colors.white
                          : Colors.primary
                      }
                      size={20}
                    />

                    <Text
                      style={[
                        styles.optionTitle,
                        selected
                          ? styles.optionTitleSelected
                          : null,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>

          <TextField
            helperText="Complete this only when the selected competency differs from the normal category for the firearm type."
            label="Competency override reason"
            multiline
            onChangeText={(value) =>
              updateValue(
                'competencyOverrideReason',
                value
              )
            }
            placeholder="Explain any manual competency selection"
            value={values.competencyOverrideReason}
          />

          <TextField
            label="Firearm notes"
            multiline
            onChangeText={(value) =>
              updateValue(
                'firearmNotes',
                value
              )
            }
            placeholder="Add relevant firearm notes"
            value={values.firearmNotes}
          />
        </View>
      </Card>

      <Card
        subtitle="Leave this section blank when no licence has been issued yet."
        title="Current licence"
      >
        <View style={styles.formGap}>
          <View style={styles.twoColumnRow}>
            <TextField
              autoCapitalize="characters"
              containerStyle={styles.flexField}
              label="Licence number"
              leftIcon={
                <FileBadge
                  color={Colors.primary}
                  size={18}
                />
              }
              onChangeText={(value) =>
                updateValue(
                  'licenceNumber',
                  value
                )
              }
              placeholder="Enter licence number"
              value={values.licenceNumber}
            />

            <TextField
              containerStyle={styles.flexField}
              label="Licence section"
              onChangeText={(value) =>
                updateValue(
                  'licenceSection',
                  value
                )
              }
              placeholder="Example: Section 13"
              value={values.licenceSection}
            />
          </View>

          <View style={styles.twoColumnRow}>
            <TextField
              autoCapitalize="none"
              containerStyle={styles.flexField}
              error={errors.licenceIssueDate}
              helperText="YYYY-MM-DD"
              label="Issue date"
              leftIcon={
                <CalendarDays
                  color={Colors.primary}
                  size={18}
                />
              }
              maxLength={10}
              onChangeText={(value) =>
                updateValue(
                  'licenceIssueDate',
                  value
                )
              }
              placeholder="YYYY-MM-DD"
              value={values.licenceIssueDate}
            />

            <TextField
              autoCapitalize="none"
              containerStyle={styles.flexField}
              error={errors.licenceExpiryDate}
              helperText="YYYY-MM-DD"
              label="Expiry date"
              leftIcon={
                <CalendarDays
                  color={Colors.primary}
                  size={18}
                />
              }
              maxLength={10}
              onChangeText={(value) =>
                updateValue(
                  'licenceExpiryDate',
                  value
                )
              }
              placeholder="YYYY-MM-DD"
              value={values.licenceExpiryDate}
            />
          </View>

          <Text style={styles.fieldLabel}>
            Licence status
          </Text>

          <View style={styles.optionGrid}>
            {LICENCE_STATUSES.map((status) => {
              const selected =
                values.licenceStatus ===
                status.value;

              return (
                <Pressable
                  key={status.value}
                  onPress={() =>
                    updateValue(
                      'licenceStatus',
                      status.value as LicenceStatus
                    )
                  }
                  style={({ pressed }) => [
                    styles.option,
                    selected
                      ? styles.optionSelected
                      : null,
                    pressed
                      ? styles.optionPressed
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionTitle,
                      selected
                        ? styles.optionTitleSelected
                        : null,
                    ]}
                  >
                    {status.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="Licence notes"
            multiline
            onChangeText={(value) =>
              updateValue(
                'licenceNotes',
                value
              )
            }
            placeholder="Add licence, renewal or submission notes"
            value={values.licenceNotes}
          />
        </View>
      </Card>

      <View style={styles.footerActions}>
        <Button
          onPress={() => navigation.goBack()}
          title="Cancel"
          variant="secondary"
        />

        <Button
          leftIcon={
            <Save
              color={Colors.white}
              size={19}
            />
          }
          loading={saving}
          onPress={() => {
            void saveFirearm();
          }}
          title={
            isEditing
              ? 'Save firearm'
              : 'Create firearm'
          }
        />
      </View>
    </Screen>
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split('-')
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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
    marginBottom: Spacing.xxl,
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
    maxWidth: 720,
  },
  formGap: {
    gap: Spacing.lg,
  },
  twoColumnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  flexField: {
    flex: 1,
    minWidth: 240,
  },
  fieldLabel: {
    ...Typography.label,
    color: Colors.silver,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  option: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionSelected: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  optionPressed: {
    opacity: 0.82,
  },
  optionTitle: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
    marginLeft: Spacing.sm,
  },
  optionTitleSelected: {
    color: Colors.white,
  },
  selectedHint: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
  },
});
