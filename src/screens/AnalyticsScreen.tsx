import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { formatDuration, formatNumber } from '../format';
import { colors, radius, spacing, typography } from '../theme';
import type { FaultCategory, MaintenanceAnalytics, User } from '../types';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionTitle,
} from '../ui';

interface AnalyticsScreenProps {
  user: User;
}

const faultCategoryLabels: Record<FaultCategory, string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  pneumatic_hydraulic: 'Pnömatik / Hidrolik',
  software_sensor: 'Yazılım / Sensör',
  other: 'Diğer',
};

const categoryColors: Record<FaultCategory, string> = {
  mechanical: colors.primary,
  electrical: colors.warning,
  pneumatic_hydraulic: colors.accent,
  software_sensor: colors.success,
  other: colors.neutral,
};

export function AnalyticsScreen({ user }: AnalyticsScreenProps) {
  const [analytics, setAnalytics] = useState<MaintenanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await api.getMaintenanceAnalytics(user.id);
      setAnalytics(response.analytics);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bakım analitiği alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !analytics) {
    return <View style={styles.center}><LoadingState label="Bakım KPI verileri hazırlanıyor…" /></View>;
  }

  if (error && !analytics) {
    return <View style={styles.center}><ErrorState message={error} onRetry={() => void load()} /></View>;
  }

  if (!analytics) return null;

  const summary = analytics.summary;
  const kpis = [
    {
      label: 'MTBF',
      value: summary.mtbfHours === null ? 'Veri yok' : `${formatNumber(summary.mtbfHours, 1)} sa`,
      note: 'Arıza bildirimi aralığı',
      color: colors.primaryDark,
      background: colors.primarySoft,
    },
    {
      label: 'MTTR',
      value: summary.mttrMinutes === null ? 'Veri yok' : formatDuration(summary.mttrMinutes),
      note: 'Kapatılmış iş emri ortalaması',
      color: colors.success,
      background: colors.successSoft,
    },
    {
      label: 'Toplam parça maliyeti',
      value: `${formatNumber(summary.totalSparePartCost, 2)} ₺`,
      note: 'İş emri + periyodik bakım',
      color: colors.warning,
      background: colors.warningSoft,
    },
    {
      label: 'Kanonik arıza',
      value: formatNumber(summary.failureCount, 0),
      note: `${formatNumber(summary.closedWorkOrderCount, 0)} kapatılmış iş emri`,
      color: colors.danger,
      background: colors.dangerSoft,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      testID="maintenance-analytics-screen"
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YÖNETİM KARMASI</Text>
        <Text style={styles.title}>Bakım Analitiği</Text>
        <Text style={styles.subtitle}>MTBF, MTTR, yedek parça maliyeti ve arıza yoğunluğunu tek ekranda izleyin.</Text>
      </View>

      {error ? <Text style={styles.warning}>{error}</Text> : null}

      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <Card key={kpi.label} style={styles.kpiCard} testID={`analytics-kpi-${kpi.label}`}>
            <View style={[styles.kpiIcon, { backgroundColor: kpi.background }]}>
              <View style={[styles.kpiDot, { backgroundColor: kpi.color }]} />
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
            <Text style={styles.kpiNote}>{kpi.note}</Text>
          </Card>
        ))}
      </View>

      <Card>
        <SectionTitle title="En çok arıza veren makineler" action={<Text style={styles.count}>Top 5</Text>} />
        {analytics.topFailureMachines.length === 0 ? (
          <EmptyState title="Arıza kaydı yok" description="Kanonik arıza bildirimi bulunan makine yok." />
        ) : (
          <View style={styles.rankingList}>
            {analytics.topFailureMachines.map((machine, index) => (
              <View key={machine.machineId} style={styles.rankingItem}>
                <View style={styles.rankBadge}><Text style={styles.rankText}>{index + 1}</Text></View>
                <View style={styles.rankingCopy}>
                  <Text style={styles.rankingTitle}>{machine.machineCode} · {machine.machineName}</Text>
                  <Text style={styles.rankingMeta}>{machine.line} · {machine.failureCount} arıza</Text>
                </View>
                <View style={styles.rankingMetrics}>
                  <Text style={styles.rankingMetric}>{machine.mtbfHours === null ? 'MTBF —' : `MTBF ${formatNumber(machine.mtbfHours, 1)} sa`}</Text>
                  <Text style={styles.rankingMetric}>{machine.mttrMinutes === null ? 'MTTR —' : `MTTR ${formatDuration(machine.mttrMinutes)}`}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle title="Arıza kategorisi dağılımı" />
        <View style={styles.categoryList}>
          {analytics.faultCategories.map((category) => {
            const color = categoryColors[category.category];
            return (
              <View key={category.category} style={styles.categoryItem}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryLabel}>{faultCategoryLabels[category.category]}</Text>
                  <Text style={styles.categoryValue}>{category.count} · %{formatNumber(category.percentage, 1)}</Text>
                </View>
                <View style={styles.categoryTrack}>
                  <View style={[styles.categoryFill, { width: `${Math.min(category.percentage, 100)}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Yedek parça maliyeti dağılımı" />
        <View style={styles.costGrid}>
          <View style={styles.costBlock}>
            <Text style={styles.costLabel}>İş emri parçaları</Text>
            <Text style={styles.costValue}>{formatNumber(summary.workOrderSparePartCost, 2)} ₺</Text>
          </View>
          <View style={styles.costBlock}>
            <Text style={styles.costLabel}>Periyodik bakım parçaları</Text>
            <Text style={styles.costValue}>{formatNumber(summary.preventiveSparePartCost, 2)} ₺</Text>
          </View>
          <View style={[styles.costBlock, styles.costBlockTotal]}>
            <Text style={styles.costLabel}>Toplam</Text>
            <Text style={[styles.costValue, styles.costValueTotal]}>{formatNumber(summary.totalSparePartCost, 2)} ₺</Text>
          </View>
        </View>
        <Text style={styles.methodology}>{analytics.methodology.cost}</Text>
      </Card>

      <Card>
        <SectionTitle title="Metot notları" />
        <Text style={styles.methodology}>{analytics.methodology.mtbf}</Text>
        <Text style={styles.methodology}>{analytics.methodology.mttr}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  header: { gap: 3 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  warning: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.md },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiCard: { flexGrow: 1, flexBasis: '44%', minWidth: 155, gap: 3 },
  kpiIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kpiDot: { width: 10, height: 10, borderRadius: 5 },
  kpiValue: { ...typography.heading, color: colors.ink },
  kpiLabel: { ...typography.label, color: colors.ink },
  kpiNote: { ...typography.caption, color: colors.inkMuted },
  count: { ...typography.caption, color: colors.inkMuted },
  rankingList: { gap: spacing.sm },
  rankingItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rankBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...typography.label, color: colors.primaryDark, fontWeight: '900' },
  rankingCopy: { flex: 1, gap: 2 },
  rankingTitle: { ...typography.label, color: colors.ink },
  rankingMeta: { ...typography.caption, color: colors.inkMuted },
  rankingMetrics: { alignItems: 'flex-end', gap: 2 },
  rankingMetric: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
  categoryList: { gap: spacing.md },
  categoryItem: { gap: 6 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  categoryLabel: { ...typography.label, color: colors.ink },
  categoryValue: { ...typography.caption, color: colors.inkMuted },
  categoryTrack: { height: 9, borderRadius: 5, backgroundColor: colors.neutralSoft, overflow: 'hidden' },
  categoryFill: { height: '100%', borderRadius: 5 },
  costGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  costBlock: { flexGrow: 1, flexBasis: '28%', minWidth: 140, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  costBlockTotal: { backgroundColor: colors.primarySoft },
  costLabel: { ...typography.caption, color: colors.inkMuted },
  costValue: { ...typography.heading, color: colors.ink },
  costValueTotal: { color: colors.primaryDark },
  methodology: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },
});
