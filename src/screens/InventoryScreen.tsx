import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api';
import { colors, radius, spacing, typography } from '../theme';
import type { Criticality, Machine, MachineStatus, User } from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  MachineCard,
  SectionTitle,
  criticalityLabels,
  statusLabels,
} from '../ui';
import { MachineFormModal } from './MachineFormModal';

interface InventoryScreenProps {
  user: User;
  onOpenMachine: (machine: Machine) => void;
}

const statusOptions: readonly { value: MachineStatus | ''; label: string }[] = [
  { value: '', label: 'Tüm durumlar' },
  { value: 'running', label: statusLabels.running },
  { value: 'maintenance', label: statusLabels.maintenance },
  { value: 'faulted', label: statusLabels.faulted },
  { value: 'stopped', label: statusLabels.stopped },
];

const criticalityOptions: readonly { value: Criticality | ''; label: string }[] = [
  { value: '', label: 'Tüm kritik seviyeler' },
  { value: 'high', label: criticalityLabels.high },
  { value: 'medium', label: criticalityLabels.medium },
  { value: 'low', label: criticalityLabels.low },
];

export function InventoryScreen({ user, onOpenMachine }: InventoryScreenProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [allLines, setAllLines] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<MachineStatus | ''>('');
  const [criticality, setCriticality] = useState<Criticality | ''>('');
  const [line, setLine] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [allResponse, filteredResponse] = await Promise.all([
        api.getMachines(user.id),
        api.getMachines(user.id, { q: query, status, criticality, line }),
      ]);
      setMachines(filteredResponse.machines);
      setAllLines([...new Set(allResponse.machines.map((machine) => machine.line))].sort((a, b) => a.localeCompare(b, 'tr')));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine envanteri alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [criticality, line, query, status, user.id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 220);
    return () => clearTimeout(timer);
  }, [load]);

  const activeFilterCount = [status, criticality, line].filter(Boolean).length;
  const lineOptions = useMemo(
    () => [{ value: '', label: 'Tüm hatlar' }, ...allLines.map((item) => ({ value: item, label: item }))],
    [allLines],
  );

  const openCreate = () => {
    setEditingMachine(null);
    setFormVisible(true);
  };

  const openEdit = (machine: Machine) => {
    setEditingMachine(machine);
    setFormVisible(true);
  };

  const handleSaved = (machine: Machine) => {
    setMachines((current) => {
      const exists = current.some((item) => item.id === machine.id);
      return exists ? current.map((item) => item.id === machine.id ? machine : item) : [machine, ...current];
    });
    void load();
  };

  return (
    <View style={styles.container} testID="inventory-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ENVANTER</Text>
            <Text style={styles.title}>Makineler</Text>
            <Text style={styles.subtitle}>{machines.length} makine listeleniyor</Text>
          </View>
          {user.role === 'admin' ? <Button title="+ Makine ekle" onPress={openCreate} compact /> : null}
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Makine ara"
            testID="machine-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Makine kodu, adı, hat veya marka ara…"
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityLabel="Aramayı temizle" onPress={() => setQuery('')} style={styles.clearButton}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterBlock}>
          <View style={styles.filterLabelRow}>
            <Text style={styles.filterLabel}>Durum</Text>
            {activeFilterCount > 0 ? (
              <Pressable onPress={() => { setStatus(''); setCriticality(''); setLine(''); }}>
                <Text style={styles.clearFilters}>{activeFilterCount} filtreyi temizle</Text>
              </Pressable>
            ) : null}
          </View>
          <FilterChips value={status} options={statusOptions} onChange={setStatus} />
        </View>
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Kritik seviye</Text>
          <FilterChips value={criticality} options={criticalityOptions} onChange={setCriticality} />
        </View>
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Üretim hattı / bölge</Text>
          <FilterChips value={line} options={lineOptions} onChange={setLine} />
        </View>

        {loading && machines.length === 0 ? <LoadingState label="Envanter hazırlanıyor…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error && machines.length === 0 ? (
          <Card>
            <EmptyState
              title="Eşleşen makine bulunamadı"
              description="Arama veya filtreleri değiştirerek tekrar deneyin."
              action={<Button title="Filtreleri temizle" onPress={() => { setQuery(''); setStatus(''); setCriticality(''); setLine(''); }} variant="secondary" compact />}
            />
          </Card>
        ) : null}

        {machines.length > 0 ? (
          <View style={styles.list}>
            <SectionTitle title="Tüm makineler" action={<Text style={styles.resultCount}>{machines.length} sonuç</Text>} />
            {machines.map((machine) => (
              <View key={machine.id} style={styles.machineWrap}>
                <MachineCard
                  machine={machine}
                  onPress={() => onOpenMachine(machine)}
                  onEdit={user.role === 'admin' ? () => openEdit(machine) : undefined}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <MachineFormModal
        visible={formVisible}
        machine={editingMachine}
        userId={user.id}
        onClose={() => setFormVisible(false)}
        onSaved={handleSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink, marginTop: 2 },
  subtitle: { ...typography.body, color: colors.inkMuted },
  searchBox: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchIcon: { color: colors.primary, fontSize: 24, fontWeight: '700' },
  searchInput: { flex: 1, minHeight: 50, color: colors.ink, ...typography.body },
  clearButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.inkMuted, fontSize: 20, lineHeight: 22 },
  filterBlock: { gap: spacing.sm },
  filterLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  filterLabel: { ...typography.label, color: colors.ink },
  clearFilters: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  list: { gap: spacing.md },
  resultCount: { ...typography.caption, color: colors.inkMuted },
  machineWrap: { position: 'relative' },
});
