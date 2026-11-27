import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { formatDate, formatDateTime } from '../format';
import { colors, radius, spacing, typography } from '../theme';
import type { ShiftHandover, ShiftType, User } from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  OptionPicker,
  SectionTitle,
} from '../ui';

interface ShiftHandoverScreenProps {
  user: User;
}

const shiftOptions: readonly { value: ShiftType; label: string }[] = [
  { value: 'morning', label: 'Sabah 08:00–16:00' },
  { value: 'evening', label: 'Akşam 16:00–24:00' },
  { value: 'night', label: 'Gece 24:00–08:00' },
];

const shiftLabels: Record<ShiftType, string> = {
  morning: 'Sabah vardiyası',
  evening: 'Akşam vardiyası',
  night: 'Gece vardiyası',
};

export function ShiftHandoverScreen({ user }: ShiftHandoverScreenProps) {
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [shift, setShift] = useState<ShiftType>('morning');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getShiftHandovers(user.id);
      setHandovers(result.handovers);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Devir teslim kayıtları alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const createHandover = async () => {
    if (!summary.trim()) {
      setActionMessage('Vardiya özeti zorunludur.');
      return;
    }
    setSubmitting(true);
    setActionMessage(null);
    try {
      const result = await api.createShiftHandover(user.id, {
        shift,
        summary: summary.trim(),
        notes: notes.trim(),
      });
      setSummary('');
      setNotes('');
      setActionMessage(`${result.handover.code} devir teslim kaydı oluşturuldu.`);
      await load(true);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Devir teslim kaydı oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (handover: ShiftHandover) => {
    setApprovingId(handover.id);
    setActionMessage(null);
    try {
      const result = await api.approveShiftHandover(user.id, handover.id);
      setActionMessage(`${result.handover.code} teslim alındı ve onaylandı.`);
      await load(true);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Devir teslim kaydı onaylanamadı.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <View style={styles.container} testID="shift-handover-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>VARDİYA DEVİR TESLİM DEFTERİ</Text>
            <Text style={styles.title}>Devir Teslim</Text>
            <Text style={styles.subtitle}>
              Açık kritik arızaları ve dikkat gerektiren makineleri sonraki vardiyaya aktarın.
            </Text>
          </View>
        </View>

        <Card style={styles.formCard}>
          <SectionTitle title="Yeni devir teslim kaydı" />
          <OptionPicker label="Vardiya" value={shift} onChange={setShift} options={shiftOptions} />
          <FormField
            label="Vardiya özeti"
            value={summary}
            onChangeText={setSummary}
            placeholder="Bu vardiyada gerçekleşen çalışmaların özeti…"
            multiline
            maxLength={4000}
          />
          <FormField
            label="Sonraki vardiyaya devir notları"
            value={notes}
            onChangeText={setNotes}
            placeholder="Dikkat edilecek noktalar, bekleyen işler ve yönlendirmeler…"
            multiline
            maxLength={4000}
          />
          <Button
            title="Devir teslim kaydı oluştur"
            onPress={() => void createHandover()}
            loading={submitting}
            testID="create-shift-handover"
          />
          <Text style={styles.formHint}>
            Açık kritik arızalar ve uyarı gerektiren makineler kayıt anında otomatik eklenir.
          </Text>
        </Card>

        {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
        {loading && !handovers.length ? <LoadingState label="Devir teslim defteri hazırlanıyor…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {!loading && !error ? (
          <View style={styles.list}>
            <SectionTitle
              title="Devir teslim kayıtları"
              action={<Text style={styles.resultCount}>{handovers.length} kayıt</Text>}
            />
            {!handovers.length ? (
              <Card>
                <EmptyState
                  title="Henüz devir teslim kaydı yok"
                  description="Vardiya sonundaki ilk teslim kaydını oluşturun."
                />
              </Card>
            ) : null}
            {handovers.map((handover) => {
              const isCreator = handover.createdByUser.id === user.id;
              return (
                <Card key={handover.id} style={styles.handoverCard} testID={`shift-handover-${handover.code}`}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.codeBox}>
                      <Text style={styles.codeText}>{handover.code}</Text>
                    </View>
                    <View style={[styles.approvalBadge, handover.approved && styles.approvalBadgeApproved]}>
                      <Text style={[styles.approvalBadgeText, handover.approved && styles.approvalBadgeTextApproved]}>
                        {handover.approved ? 'ONAYLANDI' : 'ONAY BEKLİYOR'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.handoverTitle}>{shiftLabels[handover.shift]}</Text>
                  <Text style={styles.handoverMeta}>
                    {formatDate(handover.shiftDate)} · {handover.createdByUser.name} · {formatDateTime(handover.createdAt)}
                  </Text>
                  <Text style={styles.summaryText}>{handover.summary}</Text>

                  <View style={styles.snapshotBlock}>
                    <Text style={styles.snapshotTitle}>Açık kritik arızalar · {handover.criticalFaults.length}</Text>
                    {handover.criticalFaults.length ? handover.criticalFaults.map((fault) => (
                      <Text key={fault.id} style={styles.snapshotItem}>• {fault.code} · {fault.machineCode} · {fault.title}</Text>
                    )) : <Text style={styles.snapshotEmpty}>Kritik açık arıza bulunmuyor.</Text>}
                  </View>
                  <View style={styles.snapshotBlock}>
                    <Text style={styles.snapshotTitle}>Dikkat edilmesi gereken makineler · {handover.attentionMachines.length}</Text>
                    {handover.attentionMachines.length ? handover.attentionMachines.map((machine) => (
                      <Text key={machine.id} style={styles.snapshotItem}>
                        • {machine.code} · {machine.name} · {machine.reasons.join(', ')}
                      </Text>
                    )) : <Text style={styles.snapshotEmpty}>Özel dikkat gerektiren makine bulunmuyor.</Text>}
                  </View>

                  {handover.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesLabel}>Devir notları</Text>
                      <Text style={styles.notesText}>{handover.notes}</Text>
                    </View>
                  ) : null}

                  {handover.approved && handover.approvedByUser ? (
                    <Text style={styles.approvedMeta}>
                      {handover.approvedByUser.name} tarafından {handover.approvedAt ? formatDateTime(handover.approvedAt) : 'onaylandı'}
                    </Text>
                  ) : (
                    <Button
                      title="Teslim Aldım / Onayla"
                      onPress={() => void approve(handover)}
                      disabled={!handover.canApprove}
                      loading={approvingId === handover.id}
                      variant="secondary"
                      testID={`approve-shift-handover-${handover.code}`}
                    />
                  )}
                  {isCreator && !handover.approved ? (
                    <Text style={styles.selfApprovalHint}>Devir teslimi sonraki vardiya personeli tarafından onaylanmalıdır.</Text>
                  ) : !handover.canApprove && !handover.approved ? (
                    <Text style={styles.selfApprovalHint}>Bu devir teslimini onaylamak için sonraki vardiyaya atanmış olmalısınız.</Text>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  header: { gap: 3 },
  headerCopy: { flex: 1 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  formCard: { gap: spacing.sm },
  formHint: { ...typography.caption, color: colors.inkMuted },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  list: { gap: spacing.md },
  resultCount: { ...typography.caption, color: colors.inkMuted },
  handoverCard: { gap: spacing.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  codeBox: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm },
  codeText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.3 },
  approvalBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.warningSoft },
  approvalBadgeApproved: { backgroundColor: colors.successSoft },
  approvalBadgeText: { ...typography.caption, color: colors.warning, fontWeight: '900' },
  approvalBadgeTextApproved: { color: colors.success },
  handoverTitle: { ...typography.subheading, color: colors.ink },
  handoverMeta: { ...typography.caption, color: colors.inkMuted },
  summaryText: { ...typography.body, color: colors.ink },
  snapshotBlock: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  snapshotTitle: { ...typography.label, color: colors.ink },
  snapshotItem: { ...typography.caption, color: colors.inkMuted },
  snapshotEmpty: { ...typography.caption, color: colors.success },
  notesBox: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  notesLabel: { ...typography.label, color: colors.primaryDark },
  notesText: { ...typography.body, color: colors.ink },
  approvedMeta: { ...typography.caption, color: colors.success, fontWeight: '700' },
  selfApprovalHint: { ...typography.caption, color: colors.warning },
});
