import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { colors, radius, spacing, typography } from '../theme';
import type {
  Machine,
  MachineSensorOverview,
  SensorReadingInput,
  SensorThreshold,
  SensorType,
  User,
} from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  SectionTitle,
} from '../ui';

interface SensorPanelProps {
  machine: Machine;
  user: User;
  onMachineUpdated: (machine: Machine) => void;
}

const sensorLabels: Record<SensorType, string> = {
  temperature: 'Sıcaklık',
  vibration: 'Titreşim',
  runtime_hours: 'Çalışma Saati',
  pressure: 'Basınç',
};

const sensorUnits: Record<SensorType, string> = {
  temperature: '°C',
  vibration: 'mm/s',
  runtime_hours: 'h',
  pressure: 'bar',
};

function thresholdText(threshold: SensorThreshold): string {
  return threshold.comparison === 'gte' ? '≥' : '>';
}

function exceedsThreshold(value: number, threshold: SensorThreshold): boolean {
  return threshold.comparison === 'gte'
    ? value >= threshold.criticalThreshold
    : value > threshold.criticalThreshold;
}

export function SensorPanel({ machine, user, onMachineUpdated }: SensorPanelProps) {
  const [overview, setOverview] = useState<MachineSensorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<SensorType, string>>({
    temperature: '',
    vibration: '',
    runtime_hours: '',
    pressure: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMachineSensors(user.id, machine.id);
      setOverview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sensör verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [machine.id, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result = await api.getMachineSensors(user.id, machine.id);
        setOverview(result);
      } catch {
        // Keep the last successful telemetry visible during a transient refresh failure.
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [machine.id, user.id]);

  const latestReadings = useMemo(() => {
    const values = new Map<SensorType, number>();
    for (const reading of overview?.readings ?? []) {
      if (!values.has(reading.sensorType)) values.set(reading.sensorType, reading.value);
    }
    return values;
  }, [overview?.readings]);

  const openSimulation = () => {
    const next: Record<SensorType, string> = {
      temperature: '',
      vibration: '',
      runtime_hours: '',
      pressure: '',
    };
    for (const threshold of overview?.thresholds ?? []) {
      const value = latestReadings.get(threshold.sensorType);
      next[threshold.sensorType] = value === undefined ? '' : String(value);
    }
    setDrafts(next);
    setActionMessage(null);
    setModalVisible(true);
  };

  const submitReadings = async () => {
    const readings: SensorReadingInput[] = [];
    for (const threshold of overview?.thresholds ?? []) {
      const raw = drafts[threshold.sensorType].trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        setActionMessage(`${sensorLabels[threshold.sensorType]} için geçerli bir sayı girin.`);
        return;
      }
      readings.push({ sensorType: threshold.sensorType, value });
    }
    if (!readings.length) {
      setActionMessage('En az bir sensör değeri girin.');
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    try {
      const result = await api.createMachineSensorReadings(user.id, machine.id, readings);
      setModalVisible(false);
      onMachineUpdated(result.machine);
      const activeAlert = result.alerts.find((alert) => alert.status === 'active');
      setActionMessage(
        result.workOrder?.code
          ? `${result.workOrder.code} numaralı kestirimci bakım iş emri oluşturuldu.`
          : activeAlert
            ? 'Eşik aşımı zaten takipte; mevcut kestirimci bakım iş emri korunuyor.'
            : 'Sensör verileri kaydedildi; değerler eşik içinde.',
      );
      await load();
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Sensör verileri kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const thresholds = overview?.thresholds ?? [];
  const activeAlerts = (overview?.alerts ?? []).filter((alert) => alert.status === 'active');

  return (
    <Card testID="machine-sensor-panel" style={styles.panel}>
      <SectionTitle
        title="Anlık Sensör Göstergeleri"
        action={<Text style={styles.liveLabel}>CANLI TELEMETRİ</Text>}
      />
      <Text style={styles.description}>
        Sıcaklık, titreşim, çalışma saati ve basınç değerlerini kritik eşiklerle karşılaştırın.
      </Text>

      {loading && !overview ? <LoadingState label="Sensör göstergeleri hazırlanıyor…" /> : null}
      {!loading && error && !overview ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : null}
      {overview && thresholds.length === 0 ? (
        <EmptyState
          title="Sensör eşiği tanımlı değil"
          description="Bakım yöneticisi bu makine için sensör eşiklerini tanımlamalıdır."
        />
      ) : null}

      {thresholds.length ? (
        <View style={styles.sensorGrid}>
          {thresholds.map((threshold) => {
            const value = latestReadings.get(threshold.sensorType);
            const disabled = !threshold.enabled;
            const alarm = !disabled && value !== undefined && exceedsThreshold(value, threshold);
            return (
              <View
                key={threshold.id}
                style={[styles.sensorCard, alarm && styles.sensorCardAlarm]}
                testID={`sensor-card-${threshold.sensorType}`}
              >
                <View style={styles.sensorCardTop}>
                  <Text style={styles.sensorName}>{sensorLabels[threshold.sensorType]}</Text>
                  <View style={[styles.sensorState, alarm && styles.sensorStateAlarm, disabled && styles.sensorStateDisabled]}>
                    <Text style={[styles.sensorStateText, alarm && styles.sensorStateTextAlarm, disabled && styles.sensorStateTextDisabled]}>
                      {disabled ? 'DEVRE DIŞI' : alarm ? 'EŞİK AŞILDI' : 'NORMAL'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.sensorValue, alarm && styles.sensorValueAlarm]}>
                  {value === undefined ? '—' : value.toLocaleString('tr-TR')}
                  <Text style={styles.sensorUnit}> {threshold.unit || sensorUnits[threshold.sensorType]}</Text>
                </Text>
                <Text style={styles.sensorThreshold}>
                  {disabled ? 'Eşik izleme devre dışı' : 'Kritik eşik'}: {thresholdText(threshold)} {threshold.criticalThreshold} {threshold.unit || sensorUnits[threshold.sensorType]}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {activeAlerts.length ? (
        <View style={styles.alertList}>
          {activeAlerts.map((alert) => (
            <View key={alert.id} style={styles.alertBox}>
              <Text style={styles.alertTitle}>
                {sensorLabels[alert.sensorType]} eşiği aşıldı: {alert.value} {sensorUnits[alert.sensorType]}
              </Text>
              {alert.workOrderCode ? (
                <Text style={styles.alertMeta}>Oluşturulan iş emri: {alert.workOrderCode}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
      <Button
        title="Sensör Verisi Gir / Simüle Et"
        onPress={openSimulation}
        variant="secondary"
        testID="open-sensor-simulation"
      />

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.eyebrow}>SENSÖR TELEMETRİSİ</Text>
                <Text style={styles.modalTitle}>Sensör Verisi Gir / Simüle Et</Text>
                <Text style={styles.modalSubtitle}>
                  Değerleri girin; eşik aşımında kestirimci bakım iş emri otomatik oluşturulur.
                </Text>
              </View>
              <Button title="Kapat" onPress={() => setModalVisible(false)} variant="ghost" compact />
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {thresholds.map((threshold) => (
                <FormField
                  key={threshold.sensorType}
                  label={`${sensorLabels[threshold.sensorType]} (${threshold.unit || sensorUnits[threshold.sensorType]})`}
                  value={drafts[threshold.sensorType]}
                  onChangeText={(value) => setDrafts((current) => ({
                    ...current,
                    [threshold.sensorType]: value,
                  }))}
                  keyboardType="decimal-pad"
                  placeholder={`Kritik eşik: ${thresholdText(threshold)} ${threshold.criticalThreshold}`}
                />
              ))}
              {actionMessage ? <Text style={styles.formError}>{actionMessage}</Text> : null}
              <Button
                title="Sensör verisini gönder"
                onPress={() => void submitReadings()}
                loading={submitting}
                testID="submit-sensor-readings"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  description: { ...typography.body, color: colors.inkMuted },
  liveLabel: { ...typography.caption, color: colors.success, fontWeight: '900', letterSpacing: 0.8 },
  sensorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sensorCard: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 150,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: 5,
  },
  sensorCardAlarm: { borderColor: '#E9B6B6', backgroundColor: colors.dangerSoft },
  sensorCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sensorName: { ...typography.label, color: colors.ink },
  sensorState: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.successSoft },
  sensorStateAlarm: { backgroundColor: colors.danger },
  sensorStateDisabled: { backgroundColor: colors.neutralSoft },
  sensorStateText: { ...typography.caption, color: colors.success, fontWeight: '900', fontSize: 9 },
  sensorStateTextAlarm: { color: colors.white },
  sensorStateTextDisabled: { color: colors.inkMuted },
  sensorValue: { ...typography.title, color: colors.ink, fontSize: 25, lineHeight: 31 },
  sensorValueAlarm: { color: colors.danger },
  sensorUnit: { ...typography.label, color: colors.inkMuted },
  sensorThreshold: { ...typography.caption, color: colors.inkMuted },
  alertList: { gap: spacing.sm },
  alertBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  alertTitle: { ...typography.label, color: colors.danger },
  alertMeta: { ...typography.caption, color: colors.inkMuted },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  modalSheet: { width: '100%', maxWidth: 720, alignSelf: 'center', maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1, gap: 2 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  modalTitle: { ...typography.heading, color: colors.ink },
  modalSubtitle: { ...typography.caption, color: colors.inkMuted },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  formError: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
});
