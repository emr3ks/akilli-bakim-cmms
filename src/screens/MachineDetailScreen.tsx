import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../api';
import { MeknivoLogo } from '../brand/MeknivoLogo';
import { FaultReportModal } from '../components/FaultReportModal';
import { QRCodeView } from '../components/QRCodeView';
import { SensorPanel } from '../components/SensorPanel';
import { formatDate, formatDateTime } from '../format';
import { exportMachineCardPdf, printMachineCard } from '../printing';
import { colors, radius, spacing, typography } from '../theme';
import type {
  Fault,
  Machine,
  MachineRecord,
  MaintenanceHistoryEntry,
  User,
} from '../types';
import {
  Button,
  Card,
  CriticalityBadge,
  EmptyState,
  ErrorState,
  FormField,
  InfoRow,
  LoadingState,
  OptionPicker,
  SectionTitle,
  StatusBadge,
  statusLabels,
} from '../ui';
import { MachineFormModal } from './MachineFormModal';

interface MachineDetailScreenProps {
  machine: Machine;
  user: User;
  onClose: () => void;
  onChanged: (machine: Machine) => void;
  onDeleted: (machineId: number) => void;
}

const historyTypeLabels: Record<MaintenanceHistoryEntry['type'], string> = {
  fault: 'Arıza',
  work_order: 'İş emri',
  preventive: 'Periyodik bakım',
  part_change: 'Yedek parça',
  maintenance_record: 'Bakım kaydı',
};

export function MachineDetailScreen({ machine, user, onClose, onChanged, onDeleted }: MachineDetailScreenProps) {
  const [current, setCurrent] = useState(machine);
  const [records, setRecords] = useState<MachineRecord[]>([]);
  const [phaseTwoFaults, setPhaseTwoFaults] = useState<Fault[]>([]);
  const [historyEntries, setHistoryEntries] = useState<MaintenanceHistoryEntry[]>([]);
  const [detailTab, setDetailTab] = useState<'overview' | 'history'>('overview');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sectionWarning, setSectionWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [faultFormVisible, setFaultFormVisible] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSectionWarning(null);
    setHistoryError(null);
    try {
      const [machineResult, maintenanceResult, legacyFaultResult, faultResult, historyResult] = await Promise.allSettled([
        api.getMachine(user.id, machine.id),
        api.getRecords(user.id, machine.id, 'maintenance'),
        api.getRecords(user.id, machine.id, 'fault'),
        api.getFaults(user.id, { machineId: machine.id }),
        user.role === 'operator'
          ? Promise.resolve(null)
          : api.getMachineMaintenanceHistory(user.id, machine.id),
      ]);

      if (machineResult.status === 'fulfilled') {
        setCurrent(machineResult.value.machine);
        onChanged(machineResult.value.machine);
      } else {
        setError(machineResult.reason instanceof Error
          ? machineResult.reason.message
          : 'Makine detayları alınamadı.');
      }

      const maintenanceRecords = maintenanceResult.status === 'fulfilled'
        ? maintenanceResult.value.records
        : [];
      const legacyFaultRecords = legacyFaultResult.status === 'fulfilled'
        ? legacyFaultResult.value.records
        : [];
      setRecords([...maintenanceRecords, ...legacyFaultRecords].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ));
      setPhaseTwoFaults(faultResult.status === 'fulfilled' ? faultResult.value.faults : []);

      const auxiliaryFailures = [
        maintenanceResult.status === 'rejected' ? maintenanceResult.reason : null,
        legacyFaultResult.status === 'rejected' ? legacyFaultResult.reason : null,
        faultResult.status === 'rejected' ? faultResult.reason : null,
      ].filter(Boolean);
      if (auxiliaryFailures.length) {
        setSectionWarning('Bazı geçmiş kayıtları yüklenemedi; diğer makine bilgileri kullanılabilir durumda.');
      }

      if (historyResult.status === 'fulfilled' && historyResult.value) {
        setHistoryEntries(historyResult.value.entries);
      } else if (historyResult.status === 'rejected') {
        setHistoryError(historyResult.reason instanceof Error
          ? historyResult.reason.message
          : 'Makine bakım geçmişi alınamadı.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine detayları alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [machine.id, onChanged, user.id, user.role]);

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
      await api.createMaintenanceRecord(user.id, current.id, {
        type: 'maintenance',
        description,
        severity,
      });
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

        {error ? (
          <View style={styles.inlineWarning}>
            <Text style={styles.inlineWarningText}>{error}</Text>
            <Button title="Tekrar dene" onPress={() => void load()} variant="secondary" compact />
          </View>
        ) : null}
        {sectionWarning ? <Text style={styles.sectionWarning}>{sectionWarning}</Text> : null}

        {user.role !== 'operator' ? (
          <View style={styles.detailTabs} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: detailTab === 'overview' }}
              testID="machine-detail-tab-overview"
              onPress={() => setDetailTab('overview')}
              style={[styles.detailTab, detailTab === 'overview' && styles.detailTabActive]}
            >
              <Text style={[styles.detailTabText, detailTab === 'overview' && styles.detailTabTextActive]}>Genel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: detailTab === 'history' }}
              testID="machine-detail-tab-history"
              onPress={() => setDetailTab('history')}
              style={[styles.detailTab, detailTab === 'history' && styles.detailTabActive]}
            >
              <Text style={[styles.detailTabText, detailTab === 'history' && styles.detailTabTextActive]}>Makine Bakım Geçmişi</Text>
            </Pressable>
          </View>
        ) : null}

        {detailTab === 'history' && user.role !== 'operator' ? (
          <View style={styles.historyContent} testID="machine-maintenance-history">
            <Card>
              <SectionTitle title="Kronolojik bakım kayıtları" />
              <Text style={styles.cardDescription}>
                Arızalar, iş emirleri, periyodik bakımlar ve değişen yedek parçaları tek zaman akışında gösterilir.
              </Text>
              {historyError ? (
                <ErrorState message={historyError} onRetry={() => void load()} />
              ) : historyEntries.length === 0 ? (
                <EmptyState title="Henüz bakım geçmişi yok" description="Bu makine için kayıtlı arıza, iş emri veya periyodik bakım bulunmuyor." />
              ) : (
                <View style={styles.historyList}>
                  {historyEntries.map((entry) => (
                    <View key={entry.id} style={styles.historyItem}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyType}>{historyTypeLabels[entry.type]}</Text>
                        <Text style={styles.historyDate}>{formatDateTime(entry.occurredAt)}</Text>
                      </View>
                      <View style={styles.historyTitleRow}>
                        {entry.code ? <Text style={styles.historyCode}>{entry.code}</Text> : null}
                        <Text style={styles.historyTitle}>{entry.title}</Text>
                      </View>
                      {entry.description ? <Text style={styles.historyDescription}>{entry.description}</Text> : null}
                      {entry.rootCause ? <Text style={styles.historyMeta}>Kök neden: {entry.rootCause}</Text> : null}
                      {entry.durationMinutes !== undefined && entry.durationMinutes !== null ? (
                        <Text style={styles.historyMeta}>Müdahale süresi: {entry.durationMinutes} dk</Text>
                      ) : null}
                      {entry.partCost !== undefined ? (
                        <Text style={styles.historyMeta}>Parça maliyeti: {entry.partCost.toFixed(2)} ₺</Text>
                      ) : null}
                      {entry.contextCode ? <Text style={styles.historyMeta}>Bağlam: {entry.contextCode}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
        ) : (
          <>
        <View style={styles.heroCard}>
          <View style={styles.heroCopy}>
            <Text style={styles.machineName}>{current.name}</Text>
            <Text style={styles.machineLine}>{current.line}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={current.status} />
              <CriticalityBadge criticality={current.criticality} />
            </View>
          </View>
          <View style={styles.heroMark} accessible accessibilityLabel="Meknivo">
            <MeknivoLogo variant="primary-dark" width={92} height={21} />
          </View>
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
              <InfoRow label="Anlık durum" value={statusLabels[current.status]} />
            </Card>

            <SensorPanel
              machine={current}
              user={user}
              onMachineUpdated={(updated) => {
                setCurrent(updated);
                onChanged(updated);
              }}
            />

            <Card style={styles.recordCard}>
              <SectionTitle title="Hızlı arıza bildirimi" />
              <Text style={styles.cardDescription}>
                Tespit ettiğiniz sorunu başlık, aciliyet ve fotoğrafla saniyeler içinde bildirin.
              </Text>
              <Button
                title="Arıza Bildir"
                onPress={() => setFaultFormVisible(true)}
                variant="danger"
                testID="open-fault-report"
              />
              {user.role !== 'operator' ? (
                <>
                  <View style={styles.legacyDivider} />
                  <SectionTitle title="Faz 1 planlı bakım kaydı" />
                  <Text style={styles.cardDescription}>
                    Planlı bakım notları ayrı kayıt türünde tutulur; arıza bildirimleri yalnızca yukarıdaki hızlı formdan oluşturulur.
                  </Text>
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
                  <Button
                    title="Bakım kaydı oluştur"
                    onPress={() => void submitRecord()}
                    loading={submitting}
                    variant="secondary"
                  />
                </>
              ) : null}
              {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
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

            <Card>
              <SectionTitle
                title="Faz 2 arıza kayıtları"
                action={<Text style={styles.count}>{phaseTwoFaults.length} kayıt</Text>}
              />
              {phaseTwoFaults.length === 0 ? (
                <View style={styles.emptyRecords}>
                  <Text style={styles.emptyRecordsText}>Bu makine için fotoğraflı arıza kaydı bulunmuyor.</Text>
                </View>
              ) : phaseTwoFaults.map((fault) => (
                <View key={fault.id} style={styles.phaseTwoFaultItem}>
                  <View style={styles.phaseTwoFaultHeader}>
                    <Text style={styles.phaseTwoFaultCode}>{fault.code}</Text>
                    <Text style={styles.phaseTwoFaultUrgency}>
                      {fault.urgency === 'critical' ? 'Kritik' : fault.urgency === 'high' ? 'Yüksek' : fault.urgency === 'medium' ? 'Orta' : 'Düşük'}
                    </Text>
                  </View>
                  <Text style={styles.phaseTwoFaultTitle}>{fault.title}</Text>
                  <Text style={styles.phaseTwoFaultDescription}>{fault.description}</Text>
                  <View style={styles.phaseTwoFaultMetaRow}>
                    <Text style={styles.phaseTwoFaultMeta}>
                      {fault.category === 'mechanical' ? 'Mekanik'
                        : fault.category === 'electrical' ? 'Elektrik'
                          : fault.category === 'pneumatic_hydraulic' ? 'Pnömatik / Hidrolik'
                            : fault.category === 'software_sensor' ? 'Yazılım / Sensör' : 'Diğer'}
                    </Text>
                    <Text style={styles.phaseTwoFaultMeta}>
                      {fault.workOrder ? `${fault.workOrder.code} · ${fault.workOrder.status}` : 'İş emri bekliyor'}
                    </Text>
                  </View>
                  {fault.photo ? (
                    <Image source={{ uri: fault.photo }} style={styles.phaseTwoFaultPhoto} resizeMode="cover" />
                  ) : fault.hasPhoto ? (
                    <Text style={styles.phaseTwoFaultPhotoMeta}>Fotoğraf eklendi</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          </View>

          <View style={styles.sideColumn}>
            <Card style={styles.qrCard}>
              <Text style={styles.qrTitle}>Makine QR kimliği</Text>
              <View style={styles.qrFrame}>
                <QRCodeView value={current.qrCode || current.code} size={210} />
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
          </>
        )}
      </ScrollView>

      <FaultReportModal
        visible={faultFormVisible}
        machine={current}
        user={user}
        onClose={() => setFaultFormVisible(false)}
        onReported={(fault) => {
          setFaultFormVisible(false);
          setActionMessage(`${fault.code} numaralı arıza bildirimi oluşturuldu.`);
          void load();
        }}
      />

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
  inlineWarning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md },
  inlineWarningText: { ...typography.caption, color: colors.danger, flexGrow: 1, flexBasis: 220 },
  sectionWarning: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  detailTabs: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  detailTab: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  detailTabActive: { backgroundColor: colors.surface },
  detailTabText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', textAlign: 'center' },
  detailTabTextActive: { color: colors.primaryDark },
  historyContent: { gap: spacing.md },
  historyList: { gap: spacing.sm },
  historyItem: { gap: 5, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  historyType: { ...typography.caption, color: colors.primaryDark, fontWeight: '900', textTransform: 'uppercase' },
  historyDate: { ...typography.caption, color: colors.inkMuted },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  historyCode: { ...typography.caption, color: colors.primaryDark, fontWeight: '900' },
  historyTitle: { ...typography.subheading, color: colors.ink, flexShrink: 1 },
  historyDescription: { ...typography.body, color: colors.inkMuted },
  historyMeta: { ...typography.caption, color: colors.inkMuted },
  heroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg },
  heroCopy: { flex: 1, gap: spacing.sm },
  machineName: { ...typography.heading, color: colors.white },
  machineLine: { ...typography.body, color: '#C7D6E8' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMark: { width: 92, height: 58, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  twoColumnLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.lg },
  mainColumn: { flexGrow: 1, flexBasis: '58%', minWidth: 300, gap: spacing.lg },
  sideColumn: { flexGrow: 1, flexBasis: '36%', minWidth: 280, gap: spacing.lg },
  recordCard: { gap: spacing.sm },
  legacyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
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
  phaseTwoFaultItem: { gap: 5, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  phaseTwoFaultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  phaseTwoFaultCode: { ...typography.caption, color: colors.primaryDark, fontWeight: '800' },
  phaseTwoFaultUrgency: { ...typography.caption, color: colors.danger, fontWeight: '800' },
  phaseTwoFaultTitle: { ...typography.subheading, color: colors.ink },
  phaseTwoFaultDescription: { ...typography.body, color: colors.inkMuted },
  phaseTwoFaultMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  phaseTwoFaultMeta: { ...typography.caption, color: colors.inkMuted },
  phaseTwoFaultPhoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.neutralSoft },
  phaseTwoFaultPhotoMeta: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.sm },
  qrCard: { alignItems: 'stretch', gap: spacing.md },
  qrTitle: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  qrFrame: { alignSelf: 'center', padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  qrCode: { ...typography.subheading, color: colors.primaryDark, textAlign: 'center', letterSpacing: 0.5 },
  qrHelp: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
  dangerCard: { borderColor: '#F3C7C7', gap: spacing.md },
  dangerTitle: { ...typography.subheading, color: colors.danger },
  dangerText: { ...typography.caption, color: colors.inkMuted },
});
