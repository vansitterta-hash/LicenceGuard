import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Search,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  REFERENCE_LIBRARY_ITEMS,
  type ReferenceLibraryItem,
} from '../data/referenceLibrary';
import {
  addReferenceDocumentToClient,
  buildReferenceLibraryUrl,
} from '../services/referenceLibraryService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ReferenceLibrary'
>;

function buildSearchTerms(value: string | undefined): string[] {
  return (value ?? '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function scoreItem(
  item: ReferenceLibraryItem,
  searchTerms: string[]
): number {
  if (searchTerms.length === 0) {
    return 0;
  }

  const title = item.title.toLowerCase().replace(/[×]/g, 'x');
  const folder = item.applicationFolder
    .toLowerCase()
    .replace(/[×]/g, 'x');
  const tags = item.tags
    .join(' ')
    .toLowerCase()
    .replace(/[×]/g, 'x');
  const haystack = `${title} ${folder} ${tags}`;

  return searchTerms.reduce(
    (score, term) =>
      score +
      (folder.includes(term) ? 5 : 0) +
      (title.includes(term) ? 3 : 0) +
      (tags.includes(term) ? 2 : 0) +
      (haystack.includes(term) ? 1 : 0),
    0
  );
}

export default function ReferenceLibraryScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const selectionMode =
    route.params?.selectionMode === true;
  const requiredDocumentType =
    route.params?.documentType;
  const initialQuery = route.params?.query ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(
    requiredDocumentType === 'MOTIVATION'
      ? 'Motivations'
      : 'All'
  );
  const [addingId, setAddingId] = useState<
    string | null
  >(null);

  const eligibleItems = useMemo(
    () =>
      REFERENCE_LIBRARY_ITEMS.filter(
        (item) =>
          !requiredDocumentType ||
          item.documentType === requiredDocumentType
      ),
    [requiredDocumentType]
  );

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(
          eligibleItems.map((item) => item.category)
        )
      ).sort(),
    ],
    [eligibleItems]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const terms = buildSearchTerms(query);

    return eligibleItems
      .filter((item) => {
        const categoryMatches =
          category === 'All' ||
          item.category === category;

        if (!categoryMatches) {
          return false;
        }

        if (!needle) {
          return true;
        }

        const haystack = [
          item.title,
          item.fileName,
          item.category,
          item.applicationFolder,
          item.documentType,
          ...item.tags,
        ]
          .join(' ')
          .toLowerCase()
          .replace(/[×]/g, 'x');

        return terms.every((term) =>
          haystack.includes(term)
        );
      })
      .sort(
        (a, b) =>
          scoreItem(b, terms) -
          scoreItem(a, terms)
      );
  }, [category, eligibleItems, query]);

  const openDocument = async (
    item: ReferenceLibraryItem
  ) => {
    try {
      await Linking.openURL(
        buildReferenceLibraryUrl(item.relativePath)
      );
    } catch {
      Alert.alert(
        'Unable to open reference document',
        'LicenceGuard could not open this reference file. You can still select it as a working copy for the application.'
      );
    }
  };

  const selectForApplication = async (
    item: ReferenceLibraryItem
  ) => {
    if (
      !dealerProfile?.dealerId ||
      !user?.id ||
      !route.params?.clientId
    ) {
      Alert.alert(
        'Application context missing',
        'Open the Reference Library from an application case before selecting a working document.'
      );
      return;
    }

    setAddingId(item.id);

    try {
      await addReferenceDocumentToClient({
        dealerId: dealerProfile.dealerId,
        userId: user.id,
        clientId: route.params.clientId,
        applicationCaseId:
          route.params.applicationCaseId,
        item,
      });

      Alert.alert(
        'Working copy added',
        route.params.applicationCaseId
          ? 'The selected motivation was copied to this application case. The original reference document remains unchanged.'
          : 'The selected motivation was copied to the client’s Document Library. Save the application case and link it during pack preparation.',
        [
          {
            text: 'Open documents',
            onPress: () =>
              navigation.navigate('DocumentLibrary', {
                clientId: route.params!.clientId!,
                applicationCaseId:
                  route.params?.applicationCaseId,
                documentType:
                  item.documentType as any,
              }),
          },
          {
            text: 'Return to application',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Unable to add working copy',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Screen>
      <Card padding="large">
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <BookOpen
              color={Colors.primary}
              size={24}
            />
          </View>

          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              {selectionMode
                ? 'Select a motivation'
                : 'Reference library'}
            </Text>

            <Text style={styles.subtitle}>
              {selectionMode
                ? 'Only motivation documents are shown. Select one to create a working copy for this application; the original reference remains unchanged.'
                : `${REFERENCE_LIBRARY_ITEMS.length} documents from successful firearm application packs, classified for motivations, research and supporting evidence.`}
            </Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search
            color={Colors.textMuted}
            size={18}
          />

          <TextInput
            onChangeText={setQuery}
            placeholder={
              selectionMode
                ? 'Search calibre, firearm or motivation'
                : 'Search calibre, firearm, motivation or document type'
            }
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            value={query}
          />
        </View>

        {!selectionMode ? (
          <View style={styles.categoryWrap}>
            {categories.map((item) => (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={({ pressed }) => [
                  styles.categoryButton,
                  category === item
                    ? styles.categoryButtonActive
                    : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item
                      ? styles.categoryTextActive
                      : null,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      <Text style={styles.resultCount}>
        {filtered.length} matching{' '}
        {requiredDocumentType === 'MOTIVATION'
          ? 'motivation'
          : 'document'}
        {filtered.length === 1 ? '' : 's'}
      </Text>

      {filtered.map((item) => (
        <Card key={item.id} style={styles.documentCard}>
          <View style={styles.documentRow}>
            <View style={styles.fileIcon}>
              <FileText
                color={Colors.primary}
                size={21}
              />
            </View>

            <View style={styles.documentCopy}>
              <Text style={styles.documentTitle}>
                {item.title}
              </Text>

              <Text style={styles.meta}>
                {item.category} •{' '}
                {item.applicationFolder} •{' '}
                {item.extension}
              </Text>

              {item.tags.length > 0 ? (
                <Text style={styles.tags}>
                  {item.tags.join(' • ')}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              leftIcon={
                <ExternalLink
                  color={Colors.silver}
                  size={17}
                />
              }
              onPress={() => void openDocument(item)}
              title="Preview / download"
              variant="secondary"
            />

            {selectionMode ? (
              <Button
                leftIcon={
                  <CheckCircle2
                    color={Colors.white}
                    size={17}
                  />
                }
                loading={addingId === item.id}
                onPress={() =>
                  void selectForApplication(item)
                }
                title="Use for application"
              />
            ) : null}
          </View>
        </Card>
      ))}

      {filtered.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>
            No matching reference documents
          </Text>

          <Text style={styles.subtitle}>
            Clear part of the search to see other matching
            motivations.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  headerCopy: { flex: 1 },
  title: {
    ...Typography.pageTitle,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  searchWrap: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceSoft,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    paddingVertical: Spacing.md,
    ...Typography.body,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  categoryButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceSoft,
  },
  categoryButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  categoryText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  categoryTextActive: { color: Colors.white },
  resultCount: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginVertical: Spacing.md,
  },
  documentCard: { marginBottom: Spacing.sm },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  fileIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
  },
  documentCopy: { flex: 1 },
  documentTitle: {
    ...Typography.cardTitle,
    color: Colors.text,
  },
  meta: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 3,
  },
  tags: {
    ...Typography.caption,
    color: Colors.silver,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  emptyTitle: {
    ...Typography.cardTitle,
    color: Colors.text,
  },
  pressed: { opacity: 0.72 },
});
