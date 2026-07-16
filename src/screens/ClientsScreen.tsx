  import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ChevronRight,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { listClients } from '../services/clientService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Clients'>;

export default function ClientsScreen({ navigation }: Props) {
  const { dealerProfile } = useAuth();
  const { width } = useWindowDimensions();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isCompact = width < 700;

  const loadClients = useCallback(
    async (showRefresh = false) => {
      if (!dealerProfile?.dealerId) {
        setClients([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await listClients(
          dealerProfile.dealerId,
          searchTerm
        );

        setClients(data);
      } catch (error) {
        Alert.alert(
          'Unable to load clients',
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dealerProfile?.dealerId, searchTerm]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadClients();
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [loadClients]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void loadClients();
    });

    return unsubscribe;
  }, [loadClients, navigation]);

  const openClient = (clientId: string) => {
    navigation.navigate('ClientProfile', {
      clientId,
    });
  };

  const openAddClient = () => {
    navigation.navigate('ClientForm');
  };

  const renderClient = ({ item }: { item: ClientRecord }) => {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => openClient(item.id)}
        style={({ pressed }) => [
          styles.clientPressable,
          pressed ? styles.clientPressed : null,
        ]}
      >
        <Card padding="medium" style={styles.clientCard}>
          <View style={styles.clientRow}>
            <View style={styles.avatar}>
              <UserRound
                color={Colors.silver}
                size={25}
                strokeWidth={2}
              />
            </View>

            <View style={styles.clientDetails}>
              <Text style={styles.clientName}>
                {item.first_name} {item.surname}
              </Text>

              <Text style={styles.clientMeta}>
                ID: {item.id_number}
              </Text>

              <View
                style={[
                  styles.contactRow,
                  isCompact ? styles.contactRowCompact : null,
                ]}
              >
                {item.cellphone ? (
                  <View style={styles.contactItem}>
                    <Phone
                      color={Colors.textMuted}
                      size={14}
                    />

                    <Text style={styles.contactText}>
                      {item.cellphone}
                    </Text>
                  </View>
                ) : null}

                {item.email ? (
                  <View style={styles.contactItem}>
                    <Mail
                      color={Colors.textMuted}
                      size={14}
                    />

                    <Text
                      numberOfLines={1}
                      style={styles.contactText}
                    >
                      {item.email}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ChevronRight
              color={Colors.primary}
              size={23}
              strokeWidth={2.3}
            />
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen
      contentStyle={styles.screenContent}
      maxWidth={1100}
      scroll={false}
    >
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            CLIENT MANAGEMENT
          </Text>

          <Text style={styles.title}>
            Clients
          </Text>

          <Text style={styles.subtitle}>
            Find a client quickly or create a new application record.
          </Text>
        </View>

        <Button
          leftIcon={
            <Plus
              color={Colors.white}
              size={19}
              strokeWidth={2.5}
            />
          }
          onPress={openAddClient}
          title="Add client"
        />
      </View>

      <TextField
        autoCapitalize="none"
        containerStyle={styles.searchField}
        leftIcon={
          <Search
            color={Colors.textMuted}
            size={20}
            strokeWidth={2}
          />
        }
        onChangeText={setSearchTerm}
        placeholder="Search name, ID number, cellphone or email"
        value={searchTerm}
      />

      <View style={styles.resultHeader}>
        <Text style={styles.resultCount}>
          {clients.length} active client
          {clients.length === 1 ? '' : 's'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading clients...
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={
            clients.length === 0
              ? styles.emptyList
              : styles.list
          }
          data={clients}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              onRefresh={() => {
                void loadClients(true);
              }}
              refreshing={refreshing}
              tintColor={Colors.primary}
            />
          }
          renderItem={renderClient}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Card
              padding="large"
              style={styles.emptyCard}
            >
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <UserRound
                    color={Colors.silverDark}
                    size={48}
                    strokeWidth={1.6}
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  {searchTerm
                    ? 'No matching clients'
                    : 'No clients yet'}
                </Text>

                <Text style={styles.emptyText}>
                  {searchTerm
                    ? 'Try another name, ID number, cellphone or email address.'
                    : 'Add your first client to begin tracking competencies, firearms, licences and renewals.'}
                </Text>

                {!searchTerm ? (
                  <Button
                    leftIcon={
                      <Plus
                        color={Colors.white}
                        size={18}
                        strokeWidth={2.5}
                      />
                    }
                    onPress={openAddClient}
                    style={styles.emptyButton}
                    title="Add first client"
                  />
                ) : null}
              </View>
            </Card>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.lg,
  },
  headerText: {
    flexShrink: 1,
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
  },
  searchField: {
    marginBottom: Spacing.lg,
  },
  resultHeader: {
    marginBottom: Spacing.md,
  },
  resultCount: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
  clientPressable: {
    marginBottom: Spacing.md,
  },
  clientPressed: {
    opacity: 0.82,
  },
  clientCard: {
    borderColor: Colors.border,
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  clientDetails: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  clientName: {
    ...Typography.cardTitle,
    color: Colors.white,
  },
  clientMeta: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  contactRowCompact: {
    gap: Spacing.sm,
  },
  contactItem: {
    alignItems: 'center',
    flexDirection: 'row',
    maxWidth: '100%',
  },
  contactText: {
    ...Typography.caption,
    color: Colors.silver,
    marginLeft: Spacing.xs,
  },
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
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: Spacing.xxl,
  },
  emptyCard: {
    alignSelf: 'center',
    maxWidth: 600,
    width: '100%',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radius.pill,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  emptyTitle: {
    ...Typography.sectionTitle,
    color: Colors.white,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    maxWidth: 500,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: Spacing.xl,
  },
});