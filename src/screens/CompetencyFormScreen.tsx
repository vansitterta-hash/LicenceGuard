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
  Switch,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BadgeCheck,
  CalendarDays,
  FileBadge,
  Save,
  ShieldCheck,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import {
  createCompetency,
  getCompetency,
  updateCompetency,
} from '../engines/competencyEngine';
import { getClient } from '../services/clientService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import {
  COMPETENCY_CATEGORIES,
  type CompetencyCategory,
  type CompetencyFormValues,
} from '../types/competency';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'CompetencyForm'
>;

const EMPTY_FORM: CompetencyFormValues = {
  category: 'HANDGUN',
  certificateNumber: '',
  issueDate: '',
  expiryDate: '',
  notes: '',
  verified: false,
};

export default function CompetencyFormScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();

  const [client, setClient] =
    useState<ClientRecord | null>(null);
  const [values, setValues] =
    useState<CompetencyFormValues>({
      ...EMPTY_FORM,
      category:
        route.params.initialCategory ??
        EMPTY_FORM.category,
    });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<
    Partial<
      Record<
        | 'certificateNumber'
        | 'issueDate'
        | 'expiryDate',
        string
      >
    >
  >({});

  const isEditing = Boolean(
    route.params.competencyId
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      try {
        const clientRecord = await getClient(
          route.params.clientId
        );

        setClient(clientRecord);

        if (route.params.competencyId) {
          const competency = await getCompetency(
            route.params.competencyId
          );

          setValues({
            category: competency.category,
            certificateNumber:
              competency.certificate_number ?? '',
            issueDate:
              competency.issue_date ?? '',
            expiryDate:
              competency.expiry_date ?? '',
            notes: competency.notes ?? '',
            verified: competency.verified,
          });
        }
      } catch (error) {
        Alert.alert(
          'Unable to load competency',
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
    route.params.competencyId,
  ]);

  const selectedCategory = useMemo(
    () =>
      COMPETENCY_CATEGORIES.find(
        (category) =>
          category.value === values.category
      ) ?? COMPETENCY_CATEGORIES[0],
    [values.category]
  );

  const updateValue = <Key extends keyof CompetencyFormValues>(
    key: Key,
    value: CompetencyFormValues[Key]
  ) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));

    if (
      key === 'certificateNumber' ||
      key === 'issueDate' ||
      key === 'expiryDate'
    ) {
      setErrors((current) => ({
        ...current,
        [key]: undefined,
      }));
    }
  };

  const validate = (): boolean => {
    const nextErrors: typeof errors = {};

    if (!values.certificateNumber.trim()) {
      nextErrors.certificateNumber =
        'Enter the competency certificate number.';
    }

    if (
      values.issueDate.trim() &&
      !isValidDate(values.issueDate)
    ) {
      nextErrors.issueDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      values.expiryDate.trim() &&
      !isValidDate(values.expiryDate)
    ) {
      nextErrors.expiryDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      values.issueDate.trim() &&
      values.expiryDate.trim() &&
      isValidDate(values.issueDate) &&
      isValidDate(values.expiryDate) &&
      values.expiryDate < values.issueDate
    ) {
      nextErrors.expiryDate =
        'Expiry date cannot be before the issue date.';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const saveCompetency = async () => {
    if (
      !validate() ||
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    setSaving(true);

    try {
      if (route.params.competencyId) {
        await updateCompetency(
          route.params.competencyId,
          dealerProfile.dealerId,
          user.id,
          values
        );
      } else {
        await createCompetency(
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
          ? 'Unable to update competency'
          : 'Unable to create competency',
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
            Loading competency...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={900}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {isEditing
            ? 'EDIT COMPETENCY'
            : 'ADD COMPETENCY'}
        </Text>

        <Text style={styles.title}>
          {client.first_name} {client.surname}
        </Text>

        <Text style={styles.subtitle}>
          Capture the competency certificate details
          exactly as they appear on the supporting
          documents.
        </Text>
      </View>

      <Card
        subtitle="Select the competency category represented by this certificate."
        title="Competency category"
      >
        <View style={styles.categoryGrid}>
          {COMPETENCY_CATEGORIES.map(
            (category) => {
              const selected =
                category.value === values.category;

              return (
                <Pressable
                  disabled={isEditing}
                  key={category.value}
                  onPress={() =>
                    updateValue(
                      'category',
                      category.value
                    )
                  }
                  style={({ pressed }) => [
                    styles.categoryOption,
                    selected
                      ? styles.categoryOptionSelected
                      : null,
                    pressed && !isEditing
                      ? styles.categoryOptionPressed
                      : null,
                    isEditing
                      ? styles.categoryOptionDisabled
                      : null,
                  ]}
                >
                  <View
                    style={[
                      styles.categoryIcon,
                      selected
                        ? styles.categoryIconSelected
                        : null,
                    ]}
                  >
                    <ShieldCheck
                      color={
                        selected
                          ? Colors.white
                          : Colors.primary
                      }
                      size={22}
                    />
                  </View>

                  <Text
                    style={[
                      styles.categoryTitle,
                      selected
                        ? styles.categoryTitleSelected
                        : null,
                    ]}
                  >
                    {category.label}
                  </Text>

                  <Text style={styles.categoryDescription}>
                    {category.description}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>

        {isEditing ? (
          <Text style={styles.lockedMessage}>
            The category is locked while editing to
            protect linked firearm and application
            records.
          </Text>
        ) : null}
      </Card>

      <Card
        subtitle={selectedCategory.description}
        title="Certificate details"
      >
        <View style={styles.formGap}>
          <TextField
            autoCapitalize="characters"
            error={errors.certificateNumber}
            label="Certificate number"
            leftIcon={
              <FileBadge
                color={Colors.primary}
                size={19}
              />
            }
            onChangeText={(value) =>
              updateValue(
                'certificateNumber',
                value
              )
            }
            placeholder="Enter certificate number"
            required
            value={values.certificateNumber}
          />

          <View style={styles.dateRow}>
            <TextField
              autoCapitalize="none"
              containerStyle={styles.dateField}
              error={errors.issueDate}
              helperText="YYYY-MM-DD"
              label="Issue date"
              leftIcon={
                <CalendarDays
                  color={Colors.primary}
                  size={19}
                />
              }
              maxLength={10}
              onChangeText={(value) =>
                updateValue('issueDate', value)
              }
              placeholder="YYYY-MM-DD"
              value={values.issueDate}
            />

            <TextField
              autoCapitalize="none"
              containerStyle={styles.dateField}
              error={errors.expiryDate}
              helperText="YYYY-MM-DD"
              label="Expiry date"
              leftIcon={
                <CalendarDays
                  color={Colors.primary}
                  size={19}
                />
              }
              maxLength={10}
              onChangeText={(value) =>
                updateValue('expiryDate', value)
              }
              placeholder="YYYY-MM-DD"
              value={values.expiryDate}
            />
          </View>

          <TextField
            label="Notes"
            multiline
            onChangeText={(value) =>
              updateValue('notes', value)
            }
            placeholder="Add relevant competency notes"
            value={values.notes}
          />
        </View>
      </Card>

      <Card
        subtitle="Only mark a record as verified after checking the supporting certificate."
        title="Verification"
      >
        <Pressable
          onPress={() =>
            updateValue(
              'verified',
              !values.verified
            )
          }
          style={styles.verificationRow}
        >
          <View style={styles.verificationIdentity}>
            <View
              style={[
                styles.verificationIcon,
                values.verified
                  ? styles.verificationIconActive
                  : null,
              ]}
            >
              <BadgeCheck
                color={
                  values.verified
                    ? Colors.white
                    : Colors.primary
                }
                size={22}
              />
            </View>

            <View style={styles.verificationText}>
              <Text style={styles.verificationTitle}>
                Certificate verified
              </Text>

              <Text style={styles.verificationDescription}>
                Confirm that the certificate details
                have been checked against the source
                document.
              </Text>
            </View>
          </View>

          <Switch
            onValueChange={(value) =>
              updateValue('verified', value)
            }
            value={values.verified}
          />
        </Pressable>
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
            void saveCompetency();
          }}
          title={
            isEditing
              ? 'Save competency'
              : 'Create competency'
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
    maxWidth: 680,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  categoryOption: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 180,
    minWidth: 210,
    padding: Spacing.lg,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  categoryOptionPressed: {
    opacity: 0.82,
  },
  categoryOptionDisabled: {
    opacity: 0.72,
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  categoryIconSelected: {
    backgroundColor: Colors.primary,
  },
  categoryTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  categoryTitleSelected: {
    color: Colors.white,
  },
  categoryDescription: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  lockedMessage: {
    ...Typography.caption,
    color: Colors.warning,
    marginTop: Spacing.md,
  },
  formGap: {
    gap: Spacing.lg,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  dateField: {
    flex: 1,
    minWidth: 240,
  },
  verificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  verificationIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: Spacing.lg,
  },
  verificationIcon: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  verificationIconActive: {
    backgroundColor: Colors.success,
  },
  verificationText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  verificationTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  verificationDescription: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
  },
});