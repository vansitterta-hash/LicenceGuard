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
  FileCheck2,
  Save,
  ShieldCheck,
  Target,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import {
  createApplicationCase,
  getApplicationCase,
  updateApplicationCase,
} from '../services/applicationCaseService';
import { getClient } from '../services/clientService';
import { listClientFirearms } from '../services/firearmService';
import {
  listClientCompetencies,
} from '../engines/competencyEngine';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import {
  APPLICATION_CASE_STATUSES,
  APPLICATION_CASE_TYPES,
  getDefaultProgressForStatus,
  isCompetencyApplicationType,
  isFirearmApplicationType,
  type ApplicationCaseFormValues,
  type ApplicationCaseStatus,
  type ApplicationCaseType,
} from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import {
  COMPETENCY_CATEGORIES,
  type CompetencyCategory,
  type CompetencyListItem,
} from '../types/competency';
import type { FirearmListItem } from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ApplicationCaseForm'
>;

type FormData = {
  client: ClientRecord;
  competencies: CompetencyListItem[];
  firearms: FirearmListItem[];
};

function getTodayDate(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(
    today.getMonth() + 1
  ).padStart(2, '0');
  const day = String(
    today.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const EMPTY_FORM: ApplicationCaseFormValues = {
  applicationType: 'COMPETENCY_FIRST_APPLICATION',
  status: 'NOT_STARTED',

  competencyCategory: 'HANDGUN',
  competencyId: '',

  firearmId: '',
  firearmLicenceId: '',
  licenceSection: '',

  openedDate: getTodayDate(),
  targetSubmissionDate: '',
  actualSubmissionDate: '',

  applicationReference: '',
  policeStation: '',

  outcomeDate: '',
  outcomeNotes: '',

  progressPercent: '0',

  dealerNotes: '',
  clientNotes: '',
};

export default function ApplicationCaseFormScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();

  const [data, setData] =
    useState<FormData | null>(null);
  const [values, setValues] =
    useState<ApplicationCaseFormValues>(
      EMPTY_FORM
    );
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [errors, setErrors] = useState<
    Partial<
      Record<
        | 'openedDate'
        | 'targetSubmissionDate'
        | 'actualSubmissionDate'
        | 'outcomeDate'
        | 'firearmId'
        | 'progressPercent',
        string
      >
    >
  >({});

  const isEditing = Boolean(
    route.params.applicationCaseId
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      try {
        const [
          client,
          competencies,
          firearms,
        ] = await Promise.all([
          getClient(route.params.clientId),
          listClientCompetencies(
            route.params.clientId
          ),
          listClientFirearms(
            route.params.clientId
          ),
        ]);

        setData({
          client,
          competencies,
          firearms,
        });

        if (
          route.params.applicationCaseId
        ) {
          const applicationCase =
            await getApplicationCase(
              route.params.applicationCaseId
            );

          setValues({
            applicationType:
              applicationCase.application_type,
            status:
              applicationCase.status,

            competencyCategory:
              applicationCase.competency_category ??
              'HANDGUN',

            competencyId:
              applicationCase.competency_id ??
              '',

            firearmId:
              applicationCase.firearm_id ?? '',

            firearmLicenceId:
              applicationCase.firearm_licence_id ??
              '',

            licenceSection:
              applicationCase.licence_section ??
              '',

            openedDate:
              applicationCase.opened_date,

            targetSubmissionDate:
              applicationCase.target_submission_date ??
              '',

            actualSubmissionDate:
              applicationCase.actual_submission_date ??
              '',

            applicationReference:
              applicationCase.application_reference ??
              '',

            policeStation:
              applicationCase.police_station ??
              '',

            outcomeDate:
              applicationCase.outcome_date ??
              '',

            outcomeNotes:
              applicationCase.outcome_notes ??
              '',

            progressPercent: String(
              applicationCase.progress_percent
            ),

            dealerNotes:
              applicationCase.dealer_notes ??
              '',

            clientNotes:
              applicationCase.client_notes ??
              '',
          });
        }
      } catch (error) {
        Alert.alert(
          'Unable to load application case',
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
    route.params.applicationCaseId,
    route.params.clientId,
  ]);

  const competencyApplication =
    isCompetencyApplicationType(
      values.applicationType
    );

  const firearmApplication =
    isFirearmApplicationType(
      values.applicationType
    );

  const selectedFirearm = useMemo(
    () =>
      data?.firearms.find(
        (firearm) =>
          firearm.id === values.firearmId
      ) ?? null,
    [data?.firearms, values.firearmId]
  );

  const updateValue = <
    Key extends keyof ApplicationCaseFormValues,
  >(
    key: Key,
    value: ApplicationCaseFormValues[Key]
  ) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));

    if (
      key === 'openedDate' ||
      key === 'targetSubmissionDate' ||
      key === 'actualSubmissionDate' ||
      key === 'outcomeDate' ||
      key === 'firearmId' ||
      key === 'progressPercent'
    ) {
      setErrors((current) => ({
        ...current,
        [key]: undefined,
      }));
    }
  };

  const selectApplicationType = (
    applicationType: ApplicationCaseType
  ) => {
    setValues((current) => ({
      ...current,
      applicationType,

      competencyId:
        isCompetencyApplicationType(
          applicationType
        )
          ? current.competencyId
          : '',

      firearmId:
        isFirearmApplicationType(
          applicationType
        )
          ? current.firearmId
          : '',

      firearmLicenceId:
        isFirearmApplicationType(
          applicationType
        )
          ? current.firearmLicenceId
          : '',

      licenceSection:
        isFirearmApplicationType(
          applicationType
        )
          ? current.licenceSection
          : '',
    }));
  };

  const selectStatus = (
    status: ApplicationCaseStatus
  ) => {
    setValues((current) => ({
      ...current,
      status,
      progressPercent: String(
        getDefaultProgressForStatus(status)
      ),
    }));
  };

  const selectFirearm = (
    firearm: FirearmListItem
  ) => {
    setValues((current) => ({
      ...current,
      firearmId: firearm.id,
      firearmLicenceId:
        firearm.licence?.id ?? '',
      licenceSection:
        firearm.licence?.licence_section ??
        current.licenceSection,
    }));
  };

  const validate = (): boolean => {
    const nextErrors: typeof errors = {};

    if (
      !values.openedDate.trim() ||
      !isValidDate(values.openedDate)
    ) {
      nextErrors.openedDate =
        'Enter a valid opened date using YYYY-MM-DD.';
    }

    if (
      values.targetSubmissionDate.trim() &&
      !isValidDate(
        values.targetSubmissionDate
      )
    ) {
      nextErrors.targetSubmissionDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      values.actualSubmissionDate.trim() &&
      !isValidDate(
        values.actualSubmissionDate
      )
    ) {
      nextErrors.actualSubmissionDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      values.outcomeDate.trim() &&
      !isValidDate(values.outcomeDate)
    ) {
      nextErrors.outcomeDate =
        'Use the date format YYYY-MM-DD.';
    }

    if (
      firearmApplication &&
      !values.firearmId.trim()
    ) {
      nextErrors.firearmId =
        'Select the firearm for this application.';
    }

    const progress = Number.parseInt(
      values.progressPercent,
      10
    );

    if (
      Number.isNaN(progress) ||
      progress < 0 ||
      progress > 100
    ) {
      nextErrors.progressPercent =
        'Progress must be between 0 and 100.';
    }

    setErrors(nextErrors);

    return (
      Object.keys(nextErrors).length === 0
    );
  };

  const saveApplicationCase = async () => {
    if (
      !validate() ||
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    setSaving(true);

    try {
      if (
        route.params.applicationCaseId
      ) {
        await updateApplicationCase(
          route.params.applicationCaseId,
          dealerProfile.dealerId,
          route.params.clientId,
          user.id,
          values
        );
      } else {
        await createApplicationCase(
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
          ? 'Unable to update application case'
          : 'Unable to create application case',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading application case...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      keyboardAvoiding
      maxWidth={1000}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {isEditing
            ? 'EDIT APPLICATION CASE'
            : 'OPEN APPLICATION CASE'}
        </Text>

        <Text style={styles.title}>
          {data.client.first_name}{' '}
          {data.client.surname}
        </Text>

        <Text style={styles.subtitle}>
          Track the application from first contact
          through document preparation, submission
          and final outcome.
        </Text>
      </View>

      <Card
        subtitle="Choose the application workflow being opened."
        title="Application type"
      >
        <View style={styles.optionGrid}>
          {APPLICATION_CASE_TYPES.map(
            (applicationType) => {
              const selected =
                values.applicationType ===
                applicationType.value;

              return (
                <Pressable
                  key={applicationType.value}
                  onPress={() =>
                    selectApplicationType(
                      applicationType.value
                    )
                  }
                  style={({ pressed }) => [
                    styles.largeOption,
                    selected
                      ? styles.optionSelected
                      : null,
                    pressed
                      ? styles.optionPressed
                      : null,
                  ]}
                >
                  {isCompetencyApplicationType(
                    applicationType.value
                  ) ? (
                    <ShieldCheck
                      color={
                        selected
                          ? Colors.white
                          : Colors.primary
                      }
                      size={22}
                    />
                  ) : (
                    <Target
                      color={
                        selected
                          ? Colors.white
                          : Colors.primary
                      }
                      size={22}
                    />
                  )}

                  <Text
                    style={[
                      styles.largeOptionTitle,
                      selected
                        ? styles.optionTitleSelected
                        : null,
                    ]}
                  >
                    {applicationType.label}
                  </Text>

                  <Text
                    style={
                      styles.largeOptionDescription
                    }
                  >
                    {applicationType.description}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>
      </Card>

      {competencyApplication ? (
        <Card
          subtitle="Select the competency category. Link an existing competency where applicable."
          title="Competency subject"
        >
          <Text style={styles.fieldLabel}>
            Competency category
          </Text>

          <View style={styles.optionGrid}>
            {COMPETENCY_CATEGORIES.map(
              (category) => {
                const selected =
                  values.competencyCategory ===
                  category.value;

                return (
                  <Pressable
                    key={category.value}
                    onPress={() => {
                      const matchingCompetency =
                        data.competencies.find(
                          (competency) =>
                            competency.category ===
                            category.value
                        );

                      setValues((current) => ({
                        ...current,
                        competencyCategory:
                          category.value,
                        competencyId:
                          matchingCompetency?.id ??
                          '',
                      }));
                    }}
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
                      size={18}
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

          <Text style={styles.subjectHint}>
            {values.competencyId
              ? 'An existing competency record is linked to this case.'
              : 'No existing competency record is linked. This is suitable for a first application.'}
          </Text>
        </Card>
      ) : null}

      {firearmApplication ? (
        <Card
          subtitle="Select the firearm associated with this licence application."
          title="Firearm subject"
        >
          {data.firearms.length === 0 ? (
            <View style={styles.emptySubject}>
              <Target
                color={Colors.warning}
                size={32}
              />

              <Text
                style={styles.emptySubjectTitle}
              >
                No active firearms recorded
              </Text>

              <Text
                style={styles.emptySubjectText}
              >
                Add the firearm before opening a
                firearm licence application case.
              </Text>
            </View>
          ) : (
            <View style={styles.subjectList}>
              {data.firearms.map((firearm) => {
                const selected =
                  values.firearmId === firearm.id;

                const description = [
                  firearm.make,
                  firearm.model,
                  firearm.calibre,
                  firearm.serial_number,
                ]
                  .filter(Boolean)
                  .join(' • ');

                return (
                  <Pressable
                    key={firearm.id}
                    onPress={() =>
                      selectFirearm(firearm)
                    }
                    style={({ pressed }) => [
                      styles.subjectOption,
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
                      size={21}
                    />

                    <View
                      style={
                        styles.subjectOptionText
                      }
                    >
                      <Text
                        style={[
                          styles.subjectOptionTitle,
                          selected
                            ? styles.optionTitleSelected
                            : null,
                        ]}
                      >
                        {description}
                      </Text>

                      <Text
                        style={
                          styles.subjectOptionMeta
                        }
                      >
                        {firearm.licence
                          ? `Licence ${
                              firearm.licence
                                .licence_number ??
                              'not recorded'
                            } • Expires ${
                              firearm.licence
                                .expiry_date
                            }`
                          : 'No current licence recorded'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {errors.firearmId ? (
            <Text style={styles.errorText}>
              {errors.firearmId}
            </Text>
          ) : null}

          {selectedFirearm ? (
            <Text style={styles.subjectHint}>
              Required competency:{' '}
              {
                selectedFirearm.required_competency
              }
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card title="Case status and progress">
        <Text style={styles.fieldLabel}>
          Current status
        </Text>

        <View style={styles.optionGrid}>
          {APPLICATION_CASE_STATUSES.map(
            (status) => {
              const selected =
                values.status === status.value;

              return (
                <Pressable
                  key={status.value}
                  onPress={() =>
                    selectStatus(status.value)
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
                      styles.optionTitleNoIcon,
                      selected
                        ? styles.optionTitleSelected
                        : null,
                    ]}
                  >
                    {status.label}
                  </Text>
                </Pressable>
              );
            }
          )}
        </View>

        <TextField
          containerStyle={
            styles.progressField
          }
          error={errors.progressPercent}
          helperText="Enter a value from 0 to 100."
          keyboardType="number-pad"
          label="Progress percentage"
          maxLength={3}
          onChangeText={(value) =>
            updateValue(
              'progressPercent',
              value.replace(/\D/g, '')
            )
          }
          value={values.progressPercent}
        />
      </Card>

      <Card title="Important dates">
        <View style={styles.twoColumnRow}>
          <TextField
            autoCapitalize="none"
            containerStyle={styles.flexField}
            error={errors.openedDate}
            helperText="YYYY-MM-DD"
            label="Opened date"
            leftIcon={
              <CalendarDays
                color={Colors.primary}
                size={18}
              />
            }
            maxLength={10}
            onChangeText={(value) =>
              updateValue(
                'openedDate',
                value
              )
            }
            required
            value={values.openedDate}
          />

          <TextField
            autoCapitalize="none"
            containerStyle={styles.flexField}
            error={
              errors.targetSubmissionDate
            }
            helperText="YYYY-MM-DD"
            label="Target submission date"
            leftIcon={
              <CalendarDays
                color={Colors.primary}
                size={18}
              />
            }
            maxLength={10}
            onChangeText={(value) =>
              updateValue(
                'targetSubmissionDate',
                value
              )
            }
            placeholder="YYYY-MM-DD"
            value={
              values.targetSubmissionDate
            }
          />
        </View>

        <View style={styles.twoColumnRow}>
          <TextField
            autoCapitalize="none"
            containerStyle={styles.flexField}
            error={
              errors.actualSubmissionDate
            }
            helperText="YYYY-MM-DD"
            label="Actual submission date"
            leftIcon={
              <CalendarDays
                color={Colors.primary}
                size={18}
              />
            }
            maxLength={10}
            onChangeText={(value) =>
              updateValue(
                'actualSubmissionDate',
                value
              )
            }
            placeholder="YYYY-MM-DD"
            value={
              values.actualSubmissionDate
            }
          />

          <TextField
            autoCapitalize="none"
            containerStyle={styles.flexField}
            error={errors.outcomeDate}
            helperText="YYYY-MM-DD"
            label="Outcome date"
            leftIcon={
              <CalendarDays
                color={Colors.primary}
                size={18}
              />
            }
            maxLength={10}
            onChangeText={(value) =>
              updateValue(
                'outcomeDate',
                value
              )
            }
            placeholder="YYYY-MM-DD"
            value={values.outcomeDate}
          />
        </View>
      </Card>

      <Card title="Submission information">
        {firearmApplication ? (
          <TextField
            containerStyle={styles.licenceSectionField}
            helperText="Examples: Section 13, Section 15, Section 16, Section 17 or Section 20."
            label="Licence section or legal basis"
            onChangeText={(value) =>
              updateValue(
                'licenceSection',
                value
              )
            }
            placeholder="Example: Section 16"
            value={values.licenceSection}
          />
        ) : null}

        <View style={styles.twoColumnRow}>
          <TextField
            autoCapitalize="characters"
            containerStyle={styles.flexField}
            label="Application reference"
            leftIcon={
              <FileCheck2
                color={Colors.primary}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateValue(
                'applicationReference',
                value
              )
            }
            placeholder="Enter SAPS or dealer reference"
            value={
              values.applicationReference
            }
          />

          <TextField
            autoCapitalize="words"
            containerStyle={styles.flexField}
            label="Police station"
            onChangeText={(value) =>
              updateValue(
                'policeStation',
                value
              )
            }
            placeholder="Enter police station"
            value={values.policeStation}
          />
        </View>
      </Card>

      <Card title="Case notes">
        <View style={styles.formGap}>
          <TextField
            label="Dealer notes"
            multiline
            onChangeText={(value) =>
              updateValue(
                'dealerNotes',
                value
              )
            }
            placeholder="Internal preparation, follow-up and workflow notes"
            value={values.dealerNotes}
          />

          <TextField
            label="Client-facing notes"
            multiline
            onChangeText={(value) =>
              updateValue(
                'clientNotes',
                value
              )
            }
            placeholder="Notes that may be communicated to the client"
            value={values.clientNotes}
          />

          <TextField
            label="Outcome notes"
            multiline
            onChangeText={(value) =>
              updateValue(
                'outcomeNotes',
                value
              )
            }
            placeholder="Record approval, refusal, withdrawal or closure details"
            value={values.outcomeNotes}
          />
        </View>
      </Card>

      <View style={styles.footerActions}>
        <Button
          onPress={() =>
            navigation.goBack()
          }
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
            void saveApplicationCase();
          }}
          title={
            isEditing
              ? 'Save application case'
              : 'Create application case'
          }
        />
      </View>
    </Screen>
  );
}

function isValidDate(
  value: string
): boolean {
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
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  largeOption: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 170,
    minWidth: 220,
    padding: Spacing.lg,
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
  optionTitleNoIcon: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
  },
  optionTitleSelected: {
    color: Colors.white,
  },
  largeOptionTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  largeOptionDescription: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  fieldLabel: {
    ...Typography.label,
    color: Colors.silver,
    marginBottom: Spacing.sm,
  },
  subjectHint: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  subjectList: {
    gap: Spacing.md,
  },
  subjectOption: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    padding: Spacing.md,
  },
  subjectOptionText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  subjectOptionTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  subjectOptionMeta: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  emptySubject: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptySubjectTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  emptySubjectText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  errorText: {
    ...Typography.caption,
    color: Colors.danger,
    marginTop: Spacing.sm,
  },
  progressField: {
    marginTop: Spacing.lg,
    maxWidth: 320,
  },
  licenceSectionField: {
    marginBottom: Spacing.lg,
  },
  twoColumnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  flexField: {
    flex: 1,
    minWidth: 250,
  },
  formGap: {
    gap: Spacing.lg,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
  },
});