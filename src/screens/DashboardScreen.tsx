import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { colors, radius, spacing, typography } from '../theme';
import type { DashboardSummary, Machine, User } from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MachineCard,
  SectionTitle,
  roleLabels,
  statusLabels,
} from '../ui';

interface DashboardScreenProps {
  user: User;
  onOpenMachine: (machine: Machine) => void;
  onOpenInventory: () => void;
  onOpenScanner: () => void;
  onOpenWorkOrders: () => void;
  onOpenPreventive: () => void;
}

const summaryItems: { key: keyof DashboardSummary; label: string; icon: string; color: string; background: string }[] = [
  { key: 'total', label: 'Toplam makine', icon: '▦', color: colors.primaryDark, background: colors.primarySoft },
  { key: 'running', label: 'Çalışıyor', icon: '✓', color: colors.success, background: colors.successSoft },
  { key: 'upcomingPreventive', label: 'Yaklaşan periyodik', icon: '↻', color: colors.primaryDark, background: colors.primarySoft },
  { key: 'overduePreventive', label: 'Geciken periyodik', icon: '!', color: colors.danger, background: colors.dangerSoft },
  { key: 'duePreventive', label: 'Bugünkü periyodik', icon: '◷', color: colors.warning, background: colors.warningSoft },
  { key: 'maintenance', label: 'Bakımda', icon: '◐', color: colors.warning, background: colors.warningSoft },
  { key: 'faulted', label: 'Arızalı', icon: '!', color: colors.danger, background: colors.dangerSoft },
  { key: 'openFaults', label: 'Açık arızalar', icon: '⚑', color: colors.danger, background: colors.dangerSoft },
  { key: 'activeWorkOrders', label: 'Aktif iş emirleri', icon: '⚙', color: colors.primaryDark, background: colors.primarySoft },
];

export function DashboardScreen({ user, onOpenMachine, onOpenInventory, onOpenScanner, onOpenWorkOrders, onOpenPreventive }: DashboardScreenProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [summaryResponse, machinesResponse] = await Promise.all([
        api.getDashboard(user.id),
        api.getMachines(user.id),
      ]);
      setSummary(summaryResponse);
      setMachines(machinesResponse.machines);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dashboard verileri alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const attentionMachines = machines.filter((machine) => machine.status === 'faulted' || machine.status === 'maintenance' || machine.status === 'stopped');
  const visibleSummaryItems = user.role === 'operator'
    ? summaryItems.filter((item) => !item.key.toString().includes('Preventive'))
    : summaryItems;

  if (loading && !summary) {
    return <View style={styles.center}><LoadingState label="Operasyon özeti hazırlanıyor…" /></View>;
  }

  if (error && !summary) {
    return <View style={styles.center}><ErrorState message={error} onRetry={() => void load()} /></View>;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      testID="dashboard-screen"
    >
      <View style={styles.welcomeRow}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.eyebrow}>OPERASYON PANOSU</Text>
          <Text style={styles.title}>Merhaba, {user.name.split(' ')[0]}</Text>
          <Text style={styles.subtitle}>{roleLabels[user.role]} · Tesis bakım durumu tek bakışta</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Canlı</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Button title="QR okut" onPress={onOpenScanner} compact style={styles.quickAction} />
        <Button title="Makine envanteri" onPress={onOpenInventory} variant="secondary" compact style={styles.quickAction} />
        {user.role !== 'operator' ? (
          <>
            <Button title="Bakım planları" onPress={onOpenPreventive} variant="secondary" compact style={styles.quickAction} />
            <Button title="Arıza / iş emirleri" onPress={onOpenWorkOrders} variant="danger" compact style={styles.quickAction} />
          </>
        ) : null}
      </View>

      <View>
        <SectionTitle title="Bakım özeti" />
        <View style={styles.summaryGrid}>
          {visibleSummaryItems.map((item) => (
            <Card key={item.key} style={styles.summaryCard}>
              <View style={[styles.summaryIcon, { backgroundColor: item.background }]}>
                <Text style={[styles.summaryIconText, { color: item.color }]}>{item.icon}</Text>
              </View>
              <Text style={styles.summaryValue}>{summary?.[item.key] ?? 0}</Text>
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <SectionTitle
          title="Dikkat gerektiren makineler"
          action={<Text style={styles.countLabel}>{attentionMachines.length} kayıt</Text>}
        />
        {attentionMachines.length === 0 ? (
          <Card>
            <EmptyState
              title="Tüm makineler normal"
              description="Şu anda bakım veya arıza bekleyen bir makine bulunmuyor."
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {attentionMachines.slice(0, 4).map((machine) => (
              <MachineCard key={machine.id} machine={machine} onPress={() => onOpenMachine(machine)} />
            ))}
          </View>
        )}
      </View>

      <Card style={styles.statusLegend}>
        <View style={styles.legendHeader}>
          <View>
            <Text style={styles.legendTitle}>Durum dağılımı</Text>
            <Text style={styles.legendSubtitle}>Güncel makine durumları</Text>
          </View>
          <Text style={styles.legendTotal}>{summary?.total ?? 0} toplam</Text>
        </View>
        <View style={styles.legendBars}>
          {(['running', 'maintenance', 'faulted', 'stopped'] as const).map((status) => {
            const value = summary?.[status] ?? 0;
            const total = Math.max(summary?.total ?? 0, 1);
            const color = status === 'running' ? colors.success : status === 'maintenance' ? colors.warning : status === 'faulted' ? colors.danger : colors.neutral;
            return (
              <View key={status} style={styles.legendRow}>
                <Text style={styles.legendLabel}>{statusLabels[status]}</Text>
                <View style={styles.legendTrack}>
                  <View style={[styles.legendFill, { width: `${Math.max((value / total) * 100, value ? 8 : 0)}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.legendValue}>{value}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  welcomeCopy: { flex: 1, gap: 3 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveText: { ...typography.caption, color: colors.success, fontWeight: '800' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: { flexGrow: 1, minWidth: 150 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryCard: { flexGrow: 1, flexBasis: '46%', minWidth: 150, padding: spacing.lg },
  summaryIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  summaryIconText: { fontSize: 19, fontWeight: '900' },
  summaryValue: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: colors.ink },
  summaryLabel: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  countLabel: { ...typography.caption, color: colors.inkMuted },
  list: { gap: spacing.md },
  statusLegend: { gap: spacing.lg },
  legendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  legendTitle: { ...typography.subheading, color: colors.ink },
  legendSubtitle: { ...typography.caption, color: colors.inkMuted },
  legendTotal: { ...typography.label, color: colors.primary },
  legendBars: { gap: spacing.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legendLabel: { ...typography.caption, color: colors.inkMuted, width: 82 },
  legendTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: colors.neutralSoft, overflow: 'hidden' },
  legendFill: { height: '100%', borderRadius: 5 },
  legendValue: { ...typography.label, color: colors.ink, width: 24, textAlign: 'right' },
});
