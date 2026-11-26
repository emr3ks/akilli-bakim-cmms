import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api } from '../api';
import { exportMachineCardPdf, printMachineCard } from '../printing';
import { colors, radius, spacing, typography } from '../theme';
import type { Machine, MachineRecord, RecordType, User } from '../types';
import {
  Button,
  Card,
  CriticalityBadge,
  ErrorState,
  FormField,
  InfoRow,
  LoadingState,
  OptionPicker,
  SectionTitle,
  StatusBadge,
} from '../ui';
import { MachineFormModal } from './MachineFormModal';

interface MachineDetailScreenProps {
  machine: Machine;
  user: User;
  onClose: () => void;
  onChanged: (machine: Machine) => void;
  onDeleted: (machineId: number) => void;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function MachineDetailScreen({ machine, user, onClose, onChanged, onDeleted }: MachineDetailScreenProps) {
  const [current, setCurrent] = useState(machine);
  const [records, setRecords] = useState<MachineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [recordType, setRecordType] = useState<RecordType>(user.role === 'operator' ? 'fault' : 'maintenance');
  const [submitting, setSubmitting] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [machineResponse, maintenanceResponse, faultResponse] = await Promise.all([
        api.getMachine(user.id, machine.id),
        api.getRecords(user.id, machine.id, 'maintenance'),
        api.getRecords(user.id, machine.id, 'fault'),
      ]);
      setCurrent(machineResponse.machine);
      setRecords([...maintenanceResponse.records, ...faultResponse.records].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ));
      onChanged(machineResponse.machine);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine detayları alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [machine.id, onChanged, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRecord = async () => {
    if (!description.trim()) {
      setActionMessage('Arıza veya bakım açıklaması zorunludur.');
      return;
    }
    setSubmitting(true);
    setActionMessage(null);
    try {
      if (recordType === 'fault') {
        await api.createFaultRecord(user.id, current.id, { description, severity });
      } else {
        await api.createMaintenanceRecord(user.id, current.id, { type: recordType, description, severity });
      }
      setDescription('');
      await load();
      setActionMessage('Kayıt oluşturuldu ve makine durumu güncellendi.');
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Kayıt oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteMachine = () => {
    const performDelete = async () => {
      try {
        await api.deleteMachine(user.id, current.id);
        onDeleted(current.id);
      } catch (reason) {
        setActionMessage(reason instanceof Error ? reason.message : 'Makine silinemedi.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(`${current.code} makinesini silmek istediğinize emin misiniz?`);
      if (confirmed) void performDelete();
      return;
    }

    Alert.alert(
      'Makineyi sil',
      `${current.code} makinesi ve kayıtları silinecek. Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
  };

  const print = async () => {
    try {
      setActionMessage(null);
      await printMachineCard(current);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Yazdırma işlemi başlatılamadı.');
    }
  };

  const exportPdf = async () => {
    try {
      setActionMessage(null);
      const uri = await exportMachineCardPdf(current);
      setActionMessage(`PDF kimlik kartı oluşturuldu: ${uri}`);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'PDF oluşturulamadı.');
    }
  };

  if (loading && !records.length) {
    return <View style={styles.center}><LoadingState label="Makine kartı hazırlanıyor…" /></View>;
  }

  if (error && !current.id) {
    return <View style={styles.center}><ErrorState message={error} onRetry={() => void load()} /></View>;
  }

  return (
    <View style={styles.container} testID="machine-detail-screen">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Makine kartını kapat" onPress={onClose} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.topEyebrow}>MAKİNE KARTI</Text>
            <Text style={styles.topCode}>{current.code}</Text>
          </View>
          {user.role === 'admin' ? <Button title="Düzenle" onPress={() => setFormVisible(true)} variant="secondary" compact /> : null}
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.machineName}>{current.name}</Text>
            <Text style={styles.machineLine}>{current.line}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={current.status} />
              <CriticalityBadge criticality={current.criticality} />
            </View>
          </View>
          <View style={styles.heroMark}><Text style={styles.heroMarkText}>CM</Text></View>
        </View>

        <View style={styles.twoColumnLayout}>
          <View style={styles.mainColumn}>
            <Card>
              <SectionTitle title="Ekipman bilgileri" />
              <InfoRow label="Makine kodu" value={current.code} />
              <InfoRow label="Makine adı" value={current.name} />
              <InfoRow label="Hat / bölge" value={current.line} />
              <InfoRow label="Marka" value={current.brand} />
              <InfoRow label="Model" value={current.model} />
              <InfoRow label="Seri numarası" value={current.serialNumber} />
              <InfoRow label="Kritik seviye" value={current.criticality === 'high' ? 'Yüksek' : current.criticality === 'medium' ? 'Orta' : 'Düşük'} />
              <InfoRow label="Anlık durum" value={current.status === 'running' ? 'Çalışıyor' : current.status === 'maintenance' ? 'Bakımda' : current.status === 'faulted' ? 'Arızalı' : 'Duruşta'} />
            </Card>

            <Card style={styles.recordCard}>
              <SectionTitle title={user.role === 'operator' ? 'Hızlı arıza bildirimi' : 'Bakım / arıza kaydı'} />
              <Text style={styles.cardDescription}>
                {user.role === 'operator'
                  ? 'Tespit ettiğiniz sorunu kaydedin; makine otomatik olarak arızalı olarak işaretlenir.'
                  : 'Bakım veya arıza kaydı oluşturun; makine durumu kayıt türüne göre güncellenir.'}
              </Text>
              {user.role !== 'operator' ? (
                <OptionPicker
                  label="Kayıt türü"
                  value={recordType}
                  onChange={setRecordType}
                  options={[
                    { value: 'maintenance', label: 'Bakım' },
                    { value: 'fault', label: 'Arıza' },
                  ]}
                />
              ) : null}
              <FormField
                label="Açıklama"
                value={description}
                onChangeText={setDescription}
                placeholder="Örn. Motor sesi anormal ve eksen titriyor…"
                multiline
                maxLength={4000}
              />
              <OptionPicker
                label="Önem seviyesi"
                value={severity}
                onChange={setSeverity}
                options={[
                  { value: 'low', label: 'Düşük' },
                  { value: 'medium', label: 'Orta' },
                  { value: 'high', label: 'Yüksek' },
                ]}
              />
              {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
              <Button
                title={recordType === 'fault' ? 'Arıza bildir' : 'Bakım kaydı oluştur'}
                onPress={() => void submitRecord()}
                loading={submitting}
                variant={recordType === 'fault' ? 'danger' : 'primary'}
              />
            </Card>

            <Card>
              <SectionTitle title="Bakım ve arıza geçmişi" action={<Text style={styles.count}>{records.length} kayıt</Text>} />
              {records.length === 0 ? (
                <View style={styles.emptyRecords}><Text style={styles.emptyRecordsText}>Bu makine için henüz kayıt bulunmuyor.</Text></View>
              ) : records.map((record) => (
                <View key={record.id} style={styles.recordItem}>
                  <View style={[styles.recordDot, { backgroundColor: record.type === 'fault' ? colors.danger : colors.warning }]} />
                  <View style={styles.recordBody}>
                    <View style={styles.recordHeader}>
                      <Text style={styles.recordType}>{record.type === 'fault' ? 'Arıza bildirimi' : 'Bakım kaydı'}</Text>
                      <Text style={styles.recordDate}>{formatDate(record.createdAt)}</Text>
                    </View>
                    <Text style={styles.recordDescription}>{record.description}</Text>
                    {record.severity ? <Text style={styles.recordSeverity}>Önem: {record.severity.toUpperCase()}</Text> : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>

          <View style={styles.sideColumn}>
            <Card style={styles.qrCard}>
              <Text style={styles.qrTitle}>Makine QR kimliği</Text>
              <View style={styles.qrFrame}>
                <QRCode value={current.qrCode || current.code} size={210} quietZone={4} color={colors.ink} backgroundColor={colors.white} />
              </View>
              <Text style={styles.qrCode}>{current.qrCode || current.code}</Text>
              <Text style={styles.qrHelp}>Bu kodu okutarak makine kartına hızlıca ulaşın.</Text>
              <Button title="Yazdır / PDF" onPress={() => void print()} />
              <Button title="PDF dosyası oluştur" onPress={() => void exportPdf()} variant="secondary" />
            </Card>

            {user.role === 'admin' ? (
              <Card style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Yönetici işlemleri</Text>
                <Text style={styles.dangerText}>Makineyi ve ilişkili bakım/arıza kayıtlarını kalıcı olarak siler.</Text>
                <Button title="Makineyi sil" onPress={deleteMachine} variant="danger" />
              </Card>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <MachineFormModal
        visible={formVisible}
        machine={current}
        userId={user.id}
        onClose={() => setFormVisible(false)}
        onSaved={(updated) => { setCurrent(updated); onChanged(updated); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.ink, fontSize: 32, lineHeight: 34, fontWeight: '300' },
  topCopy: { flex: 1 },
  topEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1 },
  topCode: { ...typography.heading, color: colors.ink },
  heroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg },
  heroCopy: { flex: 1, gap: spacing.sm },
  machineName: { ...typography.heading, color: colors.white },
  machineLine: { ...typography.body, color: '#C7D6E8' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMark: { width: 70, height: 70, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  heroMarkText: { color: colors.white, fontSize: 24, fontWeight: '900' },
  twoColumnLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.lg },
  mainColumn: { flexGrow: 1, flexBasis: '58%', minWidth: 300, gap: spacing.lg },
  sideColumn: { flexGrow: 1, flexBasis: '36%', minWidth: 280, gap: spacing.lg },
  recordCard: { gap: spacing.sm },
  cardDescription: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.md },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  count: { ...typography.caption, color: colors.inkMuted },
  emptyRecords: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyRecordsText: { ...typography.body, color: colors.inkMuted },
  recordItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  recordDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  recordBody: { flex: 1, gap: 4 },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  recordType: { ...typography.label, color: colors.ink },
  recordDate: { ...typography.caption, color: colors.inkMuted },
  recordDescription: { ...typography.body, color: colors.inkMuted },
  recordSeverity: { ...typography.caption, color: colors.ink, fontWeight: '700' },
  qrCard: { alignItems: 'stretch', gap: spacing.md },
  qrTitle: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  qrFrame: { alignSelf: 'center', padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  qrCode: { ...typography.subheading, color: colors.primaryDark, textAlign: 'center', letterSpacing: 0.5 },
  qrHelp: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  dangerCard: { borderColor: '#F3C7C7', gap: spacing.md },
  dangerTitle: { ...typography.subheading, color: colors.danger },
  dangerText: { ...typography.caption, color: colors.inkMuted },
});
