import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen, ExternalLink, FileText, Search } from 'lucide-react-native';

import Card from '../components/Card';
import Screen from '../components/Screen';
import { REFERENCE_LIBRARY_ITEMS } from '../data/referenceLibrary';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferenceLibrary'>;

export default function ReferenceLibraryScreen({}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(REFERENCE_LIBRARY_ITEMS.map((item) => item.category))).sort()],
    []
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return REFERENCE_LIBRARY_ITEMS.filter((item) => {
      const categoryMatches = category === 'All' || item.category === category;
      if (!categoryMatches) return false;
      if (!needle) return true;
      const haystack = [
        item.title,
        item.fileName,
        item.category,
        item.applicationFolder,
        item.documentType,
        ...item.tags,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [category, query]);

  const openDocument = async (relativePath: string) => {
    const encodedPath = relativePath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    await Linking.openURL(`/${encodedPath}`);
  };

  return (
    <Screen>
      <Card padding="large">
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <BookOpen color={Colors.primary} size={24} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Reference library</Text>
            <Text style={styles.subtitle}>
              {REFERENCE_LIBRARY_ITEMS.length} documents from successful firearm application packs, classified for motivations, research and supporting evidence.
            </Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Search color={Colors.textMuted} size={18} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search calibre, firearm, motivation or document type"
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            value={query}
          />
        </View>

        <View style={styles.categoryWrap}>
          {categories.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={({ pressed }) => [
                styles.categoryButton,
                category === item ? styles.categoryButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.categoryText, category === item ? styles.categoryTextActive : null]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Text style={styles.resultCount}>{filtered.length} matching documents</Text>

      {filtered.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => void openDocument(item.relativePath)}
          style={({ pressed }) => [pressed ? styles.pressed : null]}
        >
          <Card style={styles.documentCard}>
            <View style={styles.documentRow}>
              <View style={styles.fileIcon}>
                <FileText color={Colors.primary} size={21} />
              </View>
              <View style={styles.documentCopy}>
                <Text style={styles.documentTitle}>{item.title}</Text>
                <Text style={styles.meta}>{item.category} • {item.applicationFolder} • {item.extension}</Text>
                {item.tags.length > 0 ? (
                  <Text style={styles.tags}>{item.tags.join(' • ')}</Text>
                ) : null}
              </View>
              <ExternalLink color={Colors.silver} size={18} />
            </View>
          </Card>
        </Pressable>
      ))}

      {filtered.length === 0 ? (
        <Card>
          <Text style={styles.emptyTitle}>No matching reference documents</Text>
          <Text style={styles.subtitle}>Try a firearm model, calibre, motivation or application folder.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  headerIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  headerCopy: { flex: 1 },
  title: { ...Typography.pageTitle, color: Colors.text },
  subtitle: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xs },
  searchWrap: { marginTop: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, backgroundColor: Colors.surfaceSoft },
  searchInput: { flex: 1, color: Colors.text, paddingVertical: Spacing.md, ...Typography.body },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  categoryButton: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surfaceSoft },
  categoryButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  categoryText: { ...Typography.caption, color: Colors.textMuted },
  categoryTextActive: { color: Colors.white },
  resultCount: { ...Typography.caption, color: Colors.textMuted, marginVertical: Spacing.md },
  documentCard: { marginBottom: Spacing.sm },
  documentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  fileIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.primarySoft },
  documentCopy: { flex: 1 },
  documentTitle: { ...Typography.cardTitle, color: Colors.text },
  meta: { ...Typography.caption, color: Colors.textMuted, marginTop: 3 },
  tags: { ...Typography.caption, color: Colors.silver, marginTop: 4 },
  emptyTitle: { ...Typography.cardTitle, color: Colors.text },
  pressed: { opacity: 0.72 },
});
