import { useEffect, useMemo, useState } from 'react';
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
  Check,
  ChevronDown,
  Mail,
  MapPin,
  Phone,
  Save,
  UserRound,
  X,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import {
  createClient,
  getClient,
  updateClient,
} from '../services/clientService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type {
  ClientFormValues,
  NotificationChannel,
} from '../types/client';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ClientForm'
>;

const EMPTY_FORM: ClientFormValues = {
  firstName: '',
  surname: '',
  idNumber: '',
  cellphone: '',
  alternateCellphone: '',
  email: '',
  preferredContactChannel: 'WHATSAPP',
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  city: '',
  province: '',
  postalCode: '',
  notes: '',
};

const CONTACT_OPTIONS: Array<{
  value: NotificationChannel;
  label: string;
}> = [
  {
    value: 'WHATSAPP',
    label: 'WhatsApp',
  },
  {
    value: 'EMAIL',
    label: 'Email',
  },
  {
    value: 'SMS',
    label: 'SMS',
  },
  {
    value: 'PHONE',
    label: 'Phone call',
  },
  {
    value: 'MANUAL',
    label: 'Manual follow-up',
  },
];

export default function ClientFormScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const { width } = useWindowDimensions();

  const clientId = route.params?.clientId;
  const isEditing = Boolean(clientId);
  const isCompact = width < 760;

  const [form, setForm] =
    useState<ClientFormValues>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [showContactOptions, setShowContactOptions] =
    useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientFormValues, string>>
  >({});

  const title = isEditing ? 'Edit client' : 'Add client';

  const selectedContactLabel = useMemo(() => {
    return (
      CONTACT_OPTIONS.find(
        (option) =>
          option.value === form.preferredContactChannel
      )?.label ?? 'WhatsApp'
    );
  }, [form.preferredContactChannel]);

  const idSummary = useMemo(() => {
    return deriveSouthAfricanIdSummary(form.idNumber);
  }, [form.idNumber]);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const loadClient = async () => {
      try {
        const client = await getClient(clientId);

        setForm({
          firstName: client.first_name,
          surname: client.surname,
          idNumber: client.id_number,
          cellphone: client.cellphone ?? '',
          alternateCellphone:
            client.alternate_cellphone ?? '',
          email: client.email ?? '',
          preferredContactChannel:
            client.preferred_contact_channel,
          addressLine1: client.address_line_1 ?? '',
          addressLine2: client.address_line_2 ?? '',
          suburb: client.suburb ?? '',
          city: client.city ?? '',
          province: client.province ?? '',
          postalCode: client.postal_code ?? '',
          notes: client.notes ?? '',
        });
      } catch (error) {
        Alert.alert(
          'Unable to load client',
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.',
          [
            {
              text: 'Return',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } finally {
        setLoading(false);
      }
    };

    void loadClient();
  }, [clientId, navigation]);

  const updateField = <K extends keyof ClientFormValues>(
    field: K,
    value: ClientFormValues[K]
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  };

  const validate = () => {
    const nextErrors: Partial<
      Record<keyof ClientFormValues, string>
    > = {};

    if (!form.firstName.trim()) {
      nextErrors.firstName = 'First name is required.';
    }

    if (!form.surname.trim()) {
      nextErrors.surname = 'Surname is required.';
    }

    const cleanedId = form.idNumber.replace(/\s/g, '');

    if (!cleanedId) {
      nextErrors.idNumber = 'ID number is required.';
    } else if (!/^\d{13}$/.test(cleanedId)) {
      nextErrors.idNumber =
        'A South African ID number must contain 13 digits.';
    } else if (!isValidSouthAfricanId(cleanedId)) {
      nextErrors.idNumber =
        'The ID number does not pass the validation check.';
    }

    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim()
      )
    ) {
      nextErrors.email =
        'Enter a valid email address.';
    }

    if (
      form.cellphone.trim() &&
      form.cellphone.replace(/\D/g, '').length < 9
    ) {
      nextErrors.cellphone =
        'Enter a valid cellphone number.';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      Alert.alert(
        'Check client details',
        'Correct the highlighted fields before saving.'
      );
      return;
    }

    if (!dealerProfile?.dealerId || !user?.id) {
      Alert.alert(
        'Account error',
        'Your dealer account could not be identified.'
      );
      return;
    }

    setSaving(true);

    try {
      const normalisedForm: ClientFormValues = {
        ...form,
        idNumber: form.idNumber.replace(/\s/g, ''),
      };

      const savedClient =
        isEditing && clientId
          ? await updateClient(
              clientId,
              dealerProfile.dealerId,
              user.id,
              normalisedForm
            )
          : await createClient(
              dealerProfile.dealerId,
              user.id,
              normalisedForm
            );

      navigation.replace('ClientProfile', {
        clientId: savedClient.id,
      });
    } catch (error) {
      Alert.alert(
        'Unable to save client',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading client...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      keyboardAvoiding
      maxWidth={1050}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          CLIENT MANAGEMENT
        </Text>

        <Text style={styles.title}>
          {title}
        </Text>

        <Text style={styles.subtitle}>
          Capture the client information required for
          firearm licence and competency renewal management.
        </Text>
      </View>

      <Card
        subtitle="The firearm owner’s primary identifying information."
        title="Personal details"
      >
        <View
          style={[
            styles.fieldGrid,
            isCompact ? styles.fieldGridCompact : null,
          ]}
        >
          <TextField
            autoCapitalize="words"
            containerStyle={styles.field}
            error={errors.firstName}
            label="First name"
            leftIcon={
              <UserRound
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField('firstName', value)
            }
            required
            value={form.firstName}
          />

          <TextField
            autoCapitalize="words"
            containerStyle={styles.field}
            error={errors.surname}
            label="Surname"
            leftIcon={
              <UserRound
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField('surname', value)
            }
            required
            value={form.surname}
          />

          <TextField
            autoCapitalize="none"
            containerStyle={styles.field}
            error={errors.idNumber}
            helperText={
              idSummary ??
              'The date of birth and gender are checked from the ID number.'
            }
            keyboardType="numeric"
            label="South African ID number"
            onChangeText={(value) =>
              updateField('idNumber', value)
            }
            required
            value={form.idNumber}
          />
        </View>
      </Card>

      <Card
        subtitle="Used for renewal reminders and dealer follow-up."
        title="Contact details"
      >
        <View
          style={[
            styles.fieldGrid,
            isCompact ? styles.fieldGridCompact : null,
          ]}
        >
          <TextField
            containerStyle={styles.field}
            error={errors.cellphone}
            keyboardType="phone-pad"
            label="Cellphone"
            leftIcon={
              <Phone
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField('cellphone', value)
            }
            value={form.cellphone}
          />

          <TextField
            containerStyle={styles.field}
            keyboardType="phone-pad"
            label="Alternate cellphone"
            leftIcon={
              <Phone
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField(
                'alternateCellphone',
                value
              )
            }
            value={form.alternateCellphone}
          />

          <TextField
            autoCapitalize="none"
            containerStyle={styles.field}
            error={errors.email}
            keyboardType="email-address"
            label="Email address"
            leftIcon={
              <Mail
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField('email', value)
            }
            value={form.email}
          />
        </View>

        <View style={styles.contactSelectorBlock}>
          <Text style={styles.selectorLabel}>
            Preferred contact method
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setShowContactOptions((current) => !current)
            }
            style={({ pressed }) => [
              styles.selector,
              pressed ? styles.selectorPressed : null,
            ]}
          >
            <Text style={styles.selectorValue}>
              {selectedContactLabel}
            </Text>

            <ChevronDown
              color={Colors.silver}
              size={19}
            />
          </Pressable>

          {showContactOptions ? (
            <View style={styles.optionList}>
              {CONTACT_OPTIONS.map((option) => {
                const selected =
                  option.value ===
                  form.preferredContactChannel;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      updateField(
                        'preferredContactChannel',
                        option.value
                      );
                      setShowContactOptions(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      pressed
                        ? styles.optionPressed
                        : null,
                    ]}
                  >
                    <Text style={styles.optionText}>
                      {option.label}
                    </Text>

                    {selected ? (
                      <Check
                        color={Colors.success}
                        size={18}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Card>

      <Card
        subtitle="Used for renewal documentation and proof-of-address preparation."
        title="Residential address"
      >
        <View
          style={[
            styles.fieldGrid,
            isCompact ? styles.fieldGridCompact : null,
          ]}
        >
          <TextField
            containerStyle={styles.field}
            label="Address line 1"
            leftIcon={
              <MapPin
                color={Colors.textMuted}
                size={18}
              />
            }
            onChangeText={(value) =>
              updateField('addressLine1', value)
            }
            value={form.addressLine1}
          />

          <TextField
            containerStyle={styles.field}
            label="Address line 2"
            onChangeText={(value) =>
              updateField('addressLine2', value)
            }
            value={form.addressLine2}
          />

          <TextField
            containerStyle={styles.field}
            label="Suburb"
            onChangeText={(value) =>
              updateField('suburb', value)
            }
            value={form.suburb}
          />

          <TextField
            containerStyle={styles.field}
            label="City or town"
            onChangeText={(value) =>
              updateField('city', value)
            }
            value={form.city}
          />

          <TextField
            containerStyle={styles.field}
            label="Province"
            onChangeText={(value) =>
              updateField('province', value)
            }
            value={form.province}
          />

          <TextField
            containerStyle={styles.field}
            keyboardType="numeric"
            label="Postal code"
            onChangeText={(value) =>
              updateField('postalCode', value)
            }
            value={form.postalCode}
          />
        </View>
      </Card>

      <Card
        subtitle="Internal notes visible to authorised dealer users."
        title="Dealer notes"
      >
        <TextField
          label="Notes"
          multiline
          onChangeText={(value) =>
            updateField('notes', value)
          }
          placeholder="Add renewal instructions, follow-up information or other relevant notes."
          value={form.notes}
        />
      </Card>

      <View
        style={[
          styles.actions,
          isCompact ? styles.actionsCompact : null,
        ]}
      >
        <Button
          disabled={saving}
          leftIcon={
            <X
              color={Colors.silver}
              size={19}
            />
          }
          onPress={() => navigation.goBack()}
          title="Cancel"
          variant="secondary"
        />

        <Button
          fullWidth={isCompact}
          leftIcon={
            <Save
              color={Colors.white}
              size={19}
            />
          }
          loading={saving}
          onPress={() => {
            void handleSave();
          }}
          title={
            isEditing
              ? 'Save changes'
              : 'Save client'
          }
        />
      </View>
    </Screen>
  );
}

function isValidSouthAfricanId(
  idNumber: string
): boolean {
  if (!/^\d{13}$/.test(idNumber)) {
    return false;
  }

  const digits = idNumber
    .split('')
    .map((digit) => Number(digit));

  let sum = 0;

  for (let index = 0; index < 12; index += 1) {
    if (index % 2 === 0) {
      sum += digits[index];
    } else {
      const doubled = digits[index] * 2;
      sum +=
        doubled > 9 ? doubled - 9 : doubled;
    }
  }

  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === digits[12];
}

function deriveSouthAfricanIdSummary(
  rawIdNumber: string
): string | null {
  const idNumber = rawIdNumber.replace(/\s/g, '');

  if (!/^\d{13}$/.test(idNumber)) {
    return null;
  }

  const yearPart = Number(idNumber.slice(0, 2));
  const monthPart = Number(idNumber.slice(2, 4));
  const dayPart = Number(idNumber.slice(4, 6));

  const currentTwoDigitYear =
    new Date().getFullYear() % 100;

  const fullYear =
    yearPart <= currentTwoDigitYear
      ? 2000 + yearPart
      : 1900 + yearPart;

  const date = new Date(
    fullYear,
    monthPart - 1,
    dayPart
  );

  const validDate =
    date.getFullYear() === fullYear &&
    date.getMonth() === monthPart - 1 &&
    date.getDate() === dayPart;

  if (!validDate) {
    return 'The date encoded in this ID number is invalid.';
  }

  const genderDigits = Number(
    idNumber.slice(6, 10)
  );

  const gender =
    genderDigits >= 5000 ? 'Male' : 'Female';

  const formattedDate = date.toLocaleDateString(
    'en-ZA',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  );

  return `Date of birth: ${formattedDate} · Gender: ${gender}`;
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
    marginTop: Spacing.xs,
    maxWidth: 760,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  fieldGridCompact: {
    flexDirection: 'column',
  },
  field: {
    flexGrow: 1,
    minWidth: 270,
  },
  contactSelectorBlock: {
    marginTop: Spacing.xl,
    maxWidth: 420,
  },
  selectorLabel: {
    ...Typography.label,
    color: Colors.silver,
    marginBottom: Spacing.sm,
  },
  selector: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  selectorPressed: {
    backgroundColor: Colors.surfaceSoft,
  },
  selectorValue: {
    ...Typography.bodyStrong,
    color: Colors.text,
  },
  optionList: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  option: {
    alignItems: 'center',
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  optionPressed: {
    backgroundColor: Colors.surfaceSoft,
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  actionsCompact: {
    flexDirection: 'column-reverse',
  },
});