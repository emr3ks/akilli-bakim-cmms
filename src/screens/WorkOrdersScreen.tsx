import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { PhotoPicker, type SelectedPhoto } from '../components/PhotoPicker';
import { colors, radius, shadow, spacing, typography } from '../theme';
import type {
  Fault,
  FaultStatus,
  FaultUrgency,
  User,
  WorkOrder,
  WorkOrderStatus,
} from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  FormField,
  LoadingState,
  OptionPicker,
  SectionTitle,
} from '../ui';

interface WorkOrdersScreenProps {
  user: User;
}

type Section = 'faults' | 'workOrders';

const urgencyOptions: readonly { value: FaultUrgency | ''; label: string }[] = [
  { value: '', label: 'Tüm aciliyetler' },
  { value: 'critical', label: 'Kritik' },
  { value: 'high', label: 'Yüksek' },
  { value: 'medium', label: 'Orta' },
  { value: 'low', label: 'Düşük' },
];

const faultStatusOptions: readonly { value: FaultStatus | ''; label: string }[] = [
  { value: '', label: 'Tüm arızalar' },
  { value: 'open', label: 'Açık' },
  { value: 'resolved', label: 'Çözüldü' },
];

const workOrderStatusOptions: readonly { value: WorkOrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tüm iş emirleri' },
  { value: 'open', label: 'Açık' },
  { value: 'assigned', label: 'Atandı' },
  { value: 'in_progress', label: 'Müdahale ediliyor' },
  { value: 'waiting_parts', label: 'Parça bekliyor' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'closed', label: 'Kapatıldı' },
];

const urgencyLabels: Record<FaultUrgency, string> = {
  critical: 'Kritik - Hat durdu',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const categoryLabels: Record<Fault['category'], string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  pneumatic_hydraulic: 'Pnömatik / Hidrolik',
  software_sensor: 'Yazılım / Sensör',
  other: 'Diğer',
};

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  open: 'Açık',
  assigned: 'Atandı',
  in_progress: 'Müdahale ediliyor',
  waiting_parts: 'Parça bekliyor',
  resolved: 'Çözüldü',
  closed: 'Kapatıldı',
};

function urgencyPalette(urgency: FaultUrgency) {
  if (urgency === 'critical') return { background: colors.dangerSoft, color: colors.danger };
  if (urgency === 'high') return { background: colors.warningSoft, color: colors.warning };
  if (urgency === 'medium') return { background: colors.primarySoft, color: colors.primaryDark };
  return { background: colors.neutralSoft, color: colors.inkMuted };
}

function statusPalette(status: WorkOrderStatus) {
  if (status === 'closed' || status === 'resolved') {
    return { background: colors.successSoft, color: colors.success };
  }
  if (status === 'waiting_parts') return { background: colors.warningSoft, color: colors.warning };
  if (status === 'in_progress') return { background: colors.primarySoft, color: colors.primaryDark };
  return { background: colors.neutralSoft, color: colors.inkMuted };
}

function Badge({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function TechnicianSelectionModal({
  visible,
  title,
  description,
  submitLabel,
  technicians,
  allowUnassigned = false,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  description: string;
  submitLabel: string;
  technicians: User[];
  allowUnassigned?: boolean;
  onClose: () => void;
  onSubmit: (technicianId: number | null) => void;
}) {
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(technicians[0] ? String(technicians[0].id) : '');
    setError(null);
  }, [technicians, visible]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(selected ? Number(selected) : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const options = useMemo(() => [
    ...(allowUnassigned ? [{ value: '', label: 'Teknisyen atanmadan aç' }] : []),
    ...technicians.map((technician) => ({ value: String(technician.id), label: technician.name })),
  ], [allowUnassigned, technicians]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>BAKIM YÖNETİMİ</Text>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{description}</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <View style={styles.modalBody}>
            <OptionPicker
              label="Bakım teknisyeni"
              value={selected}
              onChange={setSelected}
              options={options}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={submitLabel} onPress={() => void submit()} loading={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompletionModal({
  workOrder,
  visible,
  onClose,
  onSubmit,
}: {
  workOrder: WorkOrder | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    interventionNote: string;
    rootCause: string;
    durationMinutes: number;
    solutionPhotoBase64: string | null;
    solutionPhotoMimeType: string | null;
  }) => Promise<void>;
}) {
  const [interventionNote, setInterventionNote] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [duration, setDuration] = useState('');
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setInterventionNote('');
    setRootCause('');
    setDuration('');
    setPhoto(null);
    setError(null);
  }, [visible, workOrder?.id]);

  const submit = async () => {
    const durationMinutes = Number(duration);
    if (!interventionNote.trim() || !rootCause.trim()) {
      setError('Müdahale notu ve kök neden açıklaması zorunludur.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
      setError('Harcanan süre dakika cinsinden tam sayı olmalıdır.');
      return;
    }
    if (!photo) {
      setError('Çözüm fotoğrafı zorunludur.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        interventionNote,
        rootCause,
        durationMinutes,
        solutionPhotoBase64: photo.base64,
        solutionPhotoMimeType: photo.mimeType,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İş emri kapatılamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>İŞ EMRİ KAPANIŞI</Text>
              <Text style={styles.modalTitle}>{workOrder?.code}</Text>
              <Text style={styles.modalSubtitle}>Müdahale kanıtını ekleyerek arızayı çözüldü olarak kaydedin.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <FormField
              label="Müdahale notu"
              value={interventionNote}
              onChangeText={setInterventionNote}
              placeholder="Yapılan işlemler ve doğrulama sonucu…"
              multiline
              maxLength={4000}
            />
            <FormField
              label="Kök neden açıklaması"
              value={rootCause}
              onChangeText={setRootCause}
              placeholder="Arızanın temel nedeni…"
              multiline
              maxLength={4000}
            />
            <FormField
              label="Harcanan süre (dakika)"
              value={duration}
              onChangeText={setDuration}
              placeholder="Örn. 75"
              keyboardType="number-pad"
            />
            <PhotoPicker value={photo} onChange={setPhoto} label="Çözüm fotoğrafı" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Çözüldü olarak kaydet" onPress={() => void submit()} loading={submitting} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function WorkOrdersScreen({ user }: WorkOrdersScreenProps) {
  const [section, setSection] = useState<Section>('faults');
  const [faults, setFaults] = useState<Fault[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [urgency, setUrgency] = useState<FaultUrgency | ''>('');
  const [assignedTo, setAssignedTo] = useState('');
  const [faultStatus, setFaultStatus] = useState<FaultStatus | ''>('open');
  const [workOrderStatus, setWorkOrderStatus] = useState<WorkOrderStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createFault, setCreateFault] = useState<Fault | null>(null);
  const [assignWorkOrder, setAssignWorkOrder] = useState<WorkOrder | null>(null);
  const [completeWorkOrder, setCompleteWorkOrder] = useState<WorkOrder | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [faultResponse, workOrderResponse, userResponse] = await Promise.all([
        api.getFaults(user.id, {
          status: faultStatus,
          urgency,
          assignedTo: assignedTo ? Number(assignedTo) : '',
        }),
        api.getWorkOrders(user.id, {
          status: workOrderStatus,
          urgency,
          assignedTo: assignedTo ? Number(assignedTo) : '',
        }),
        api.getDemoUsers(),
      ]);
      setFaults(faultResponse.faults);
      setWorkOrders(workOrderResponse.workOrders);
      setTechnicians(userResponse.users.filter((candidate) => candidate.role === 'technician'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Arıza ve iş emri kayıtları alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assignedTo, faultStatus, urgency, user.id, workOrderStatus]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);

  const technicianOptions = useMemo(() => [
    { value: '', label: 'Tüm teknisyenler' },
    ...technicians.map((technician) => ({ value: String(technician.id), label: technician.name })),
  ], [technicians]);

  const updateStatus = async (workOrder: WorkOrder, status: WorkOrderStatus) => {
    setActionMessage(null);
    try {
      await api.updateWorkOrderStatus(user.id, workOrder.id, status);
      setActionMessage(`${workOrder.code} → ${workOrderStatusLabels[status]}`);
      await load(true);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'İş emri durumu güncellenemedi.');
    }
  };

  const createWorkOrder = async (technicianId: number | null) => {
    if (!createFault) return;
    await api.createWorkOrder(user.id, createFault.id, technicianId);
    setCreateFault(null);
    setActionMessage(`${createFault.code} için iş emri oluşturuldu.`);
    await load(true);
  };

  const assign = async (technicianId: number | null) => {
    if (!assignWorkOrder) return;
    if (!technicianId) throw new Error('Bir bakım teknisyeni seçin.');
    await api.assignWorkOrder(user.id, assignWorkOrder.id, technicianId);
    setAssignWorkOrder(null);
    setActionMessage(`${assignWorkOrder.code} teknisyene atandı.`);
    await load(true);
  };

  const complete = async (payload: {
    interventionNote: string;
    rootCause: string;
    durationMinutes: number;
    solutionPhotoBase64: string | null;
    solutionPhotoMimeType: string | null;
  }) => {
    if (!completeWorkOrder) return;
    await api.updateWorkOrderStatus(user.id, completeWorkOrder.id, 'resolved', payload);
    setCompleteWorkOrder(null);
    setActionMessage(`${completeWorkOrder.code} çözüldü olarak kaydedildi.`);
    await load(true);
  };

  const renderFault = (fault: Fault) => {
    const palette = urgencyPalette(fault.urgency);
    return (
      <Card key={fault.id} style={styles.recordCard} testID={`fault-${fault.code}`}>
        <View style={styles.cardTopRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{fault.code}</Text>
          </View>
          <Badge label={urgencyLabels[fault.urgency]} background={palette.background} color={palette.color} />
        </View>
        <Text style={styles.recordTitle}>{fault.title}</Text>
        <Text style={styles.recordMeta}>{fault.machine.code} · {fault.machine.name} · {fault.machine.line}</Text>
        <View style={styles.badgeRow}>
          <Badge label={categoryLabels[fault.category]} background={colors.neutralSoft} color={colors.inkMuted} />
          <Badge
            label={fault.status === 'open' ? 'Açık arıza' : 'Çözüldü'}
            background={fault.status === 'open' ? colors.dangerSoft : colors.successSoft}
            color={fault.status === 'open' ? colors.danger : colors.success}
          />
        </View>
        <Text style={styles.description}>{fault.description}</Text>
        {fault.photo ? (
          <Image source={{ uri: fault.photo }} style={styles.faultPhoto} resizeMode="cover" />
        ) : null}
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>{fault.reportedBy.name} · {new Date(fault.createdAt).toLocaleDateString('tr-TR')}</Text>
          {fault.workOrder ? (
            <Text style={styles.workOrderLink}>{fault.workOrder.code} · {workOrderStatusLabels[fault.workOrder.status]}</Text>
          ) : null}
        </View>
        {user.role === 'admin' && fault.status === 'open' && !fault.workOrder ? (
          <Button title="İş emri oluştur ve teknisyen ata" onPress={() => setCreateFault(fault)} compact />
        ) : null}
      </Card>
    );
  };

  const renderWorkOrder = (workOrder: WorkOrder) => {
    const palette = statusPalette(workOrder.status);
    const canProgress = user.role === 'technician' && workOrder.assignedTo?.id === user.id;
    return (
      <Card key={workOrder.id} style={styles.recordCard} testID={`work-order-${workOrder.code}`}>
        <View style={styles.cardTopRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{workOrder.code}</Text>
          </View>
          <Badge label={workOrderStatusLabels[workOrder.status]} background={palette.background} color={palette.color} />
        </View>
        <Text style={styles.recordTitle}>{workOrder.fault.title}</Text>
        <Text style={styles.recordMeta}>{workOrder.machine.code} · {workOrder.machine.name}</Text>
        <View style={styles.badgeRow}>
          <Badge
            label={urgencyLabels[workOrder.fault.urgency]}
            background={urgencyPalette(workOrder.fault.urgency).background}
            color={urgencyPalette(workOrder.fault.urgency).color}
          />
          <Badge
            label={workOrder.assignedTo ? workOrder.assignedTo.name : 'Teknisyen bekleniyor'}
            background={colors.primarySoft}
            color={colors.primaryDark}
          />
        </View>
        <Text style={styles.description}>{workOrder.fault.description}</Text>
        {workOrder.rootCause ? (
          <View style={styles.evidenceBox}>
            <Text style={styles.evidenceLabel}>Kök neden</Text>
            <Text style={styles.evidenceText}>{workOrder.rootCause}</Text>
            {workOrder.durationMinutes !== null ? (
              <Text style={styles.evidenceMeta}>Harcanan süre: {workOrder.durationMinutes} dk</Text>
            ) : null}
          </View>
        ) : null}
        {workOrder.solutionPhoto ? (
          <Image source={{ uri: workOrder.solutionPhoto }} style={styles.faultPhoto} resizeMode="cover" />
        ) : null}
        {user.role === 'admin' && workOrder.status === 'open' ? (
          <Button title="Teknisyen ata" onPress={() => setAssignWorkOrder(workOrder)} compact />
        ) : null}
        {canProgress && workOrder.status === 'assigned' ? (
          <Button title="Müdahaleye başla" onPress={() => void updateStatus(workOrder, 'in_progress')} compact />
        ) : null}
        {canProgress && workOrder.status === 'in_progress' ? (
          <View style={styles.actionRow}>
            <Button title="Parça bekle" onPress={() => void updateStatus(workOrder, 'waiting_parts')} variant="secondary" compact style={styles.actionButton} />
            <Button title="Çözüldü" onPress={() => setCompleteWorkOrder(workOrder)} compact style={styles.actionButton} />
          </View>
        ) : null}
        {canProgress && workOrder.status === 'waiting_parts' ? (
          <View style={styles.actionRow}>
            <Button title="Müdahaleye dön" onPress={() => void updateStatus(workOrder, 'in_progress')} variant="secondary" compact style={styles.actionButton} />
            <Button title="Çözüldü" onPress={() => setCompleteWorkOrder(workOrder)} compact style={styles.actionButton} />
          </View>
        ) : null}
        {canProgress && workOrder.status === 'resolved' ? (
          <Button title="İş emrini kapat" onPress={() => void updateStatus(workOrder, 'closed')} compact />
        ) : null}
      </Card>
    );
  };

  const activeFilterCount = [urgency, assignedTo, section === 'faults' ? faultStatus : workOrderStatus].filter(Boolean).length;

  return (
    <View style={styles.container} testID="work-orders-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ARIZA VE ÇÖZÜM AKIŞI</Text>
            <Text style={styles.title}>Arızalar & İş Emirleri</Text>
            <Text style={styles.subtitle}>Saha bildirimlerini yöneticiye, iş emirlerini teknisyene aktarın.</Text>
          </View>
        </View>

        <View style={styles.segmented}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'faults' }}
            onPress={() => setSection('faults')}
            style={[styles.segment, section === 'faults' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, section === 'faults' && styles.segmentTextActive]}>Açık arızalar · {faults.length}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'workOrders' }}
            onPress={() => setSection('workOrders')}
            style={[styles.segment, section === 'workOrders' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, section === 'workOrders' && styles.segmentTextActive]}>İş emirleri · {workOrders.length}</Text>
          </Pressable>
        </View>

        <View style={styles.filterBlock}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterLabel}>Aciliyet</Text>
            {activeFilterCount > 0 ? (
              <Pressable onPress={() => { setUrgency(''); setAssignedTo(''); setFaultStatus(''); setWorkOrderStatus(''); }}>
                <Text style={styles.clearFilters}>Filtreleri temizle</Text>
              </Pressable>
            ) : null}
          </View>
          <FilterChips value={urgency} options={urgencyOptions} onChange={setUrgency} />
        </View>
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Atanan teknisyen</Text>
          <FilterChips value={assignedTo} options={technicianOptions} onChange={setAssignedTo} />
        </View>
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>{section === 'faults' ? 'Arıza durumu' : 'İş emri durumu'}</Text>
          <FilterChips
            value={section === 'faults' ? faultStatus : workOrderStatus}
            options={section === 'faults' ? faultStatusOptions : workOrderStatusOptions}
            onChange={(value) => {
              if (section === 'faults') setFaultStatus(value as FaultStatus | '');
              else setWorkOrderStatus(value as WorkOrderStatus | '');
            }}
          />
        </View>

        {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
        {loading && faults.length === 0 && workOrders.length === 0 ? <LoadingState label="Arıza ve iş emri kayıtları hazırlanıyor…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {!loading && !error ? (
          <View style={styles.list}>
            <SectionTitle
              title={section === 'faults' ? 'Arıza bildirimleri' : 'Bakım iş emirleri'}
              action={<Text style={styles.resultCount}>{section === 'faults' ? faults.length : workOrders.length} kayıt</Text>}
            />
            {section === 'faults' ? (
              faults.length ? faults.map(renderFault) : (
                <Card><EmptyState title="Eşleşen arıza yok" description="Filtreleri değiştirerek diğer arıza kayıtlarını görüntüleyin." /></Card>
              )
            ) : (
              workOrders.length ? workOrders.map(renderWorkOrder) : (
                <Card><EmptyState title="Eşleşen iş emri yok" description="Yeni iş emirleri burada ve durum akışına göre görüntülenecek." /></Card>
              )
            )}
          </View>
        ) : null}
      </ScrollView>

      <TechnicianSelectionModal
        visible={Boolean(createFault)}
        title="İş emri oluştur"
        description={createFault ? `${createFault.code} · ${createFault.title}` : ''}
        submitLabel="İş emrini oluştur"
        technicians={technicians}
        allowUnassigned
        onClose={() => setCreateFault(null)}
        onSubmit={createWorkOrder}
      />
      <TechnicianSelectionModal
        visible={Boolean(assignWorkOrder)}
        title="Teknisyen ata"
        description={assignWorkOrder ? `${assignWorkOrder.code} · ${assignWorkOrder.fault.title}` : ''}
        submitLabel="Teknisyene ata"
        technicians={technicians}
        onClose={() => setAssignWorkOrder(null)}
        onSubmit={assign}
      />
      <CompletionModal
        visible={Boolean(completeWorkOrder)}
        workOrder={completeWorkOrder}
        onClose={() => setCompleteWorkOrder(null)}
        onSubmit={complete}
      />
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
  segmented: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', textAlign: 'center' },
  segmentTextActive: { color: colors.primaryDark },
  filterBlock: { gap: spacing.sm },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  filterLabel: { ...typography.label, color: colors.ink },
  clearFilters: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  list: { gap: spacing.md },
  resultCount: { ...typography.caption, color: colors.inkMuted },
  recordCard: { gap: spacing.sm },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  codeBox: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm },
  codeText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.3 },
  recordTitle: { ...typography.subheading, color: colors.ink, marginTop: 2 },
  recordMeta: { ...typography.caption, color: colors.inkMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { ...typography.caption, fontWeight: '800' },
  description: { ...typography.body, color: colors.inkMuted },
  faultPhoto: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.neutralSoft },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  footerText: { ...typography.caption, color: colors.inkMuted },
  workOrderLink: { ...typography.caption, color: colors.primaryDark, fontWeight: '800' },
  evidenceBox: { backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, gap: 3 },
  evidenceLabel: { ...typography.caption, color: colors.success, fontWeight: '900' },
  evidenceText: { ...typography.body, color: colors.ink },
  evidenceMeta: { ...typography.caption, color: colors.inkMuted },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { flexGrow: 1, minWidth: 140 },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  modalSheet: { maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1, gap: 2 },
  modalTitle: { ...typography.heading, color: colors.ink },
  modalSubtitle: { ...typography.caption, color: colors.inkMuted },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
});
