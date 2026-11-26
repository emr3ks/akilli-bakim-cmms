import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { colors, radius, shadow, spacing, typography } from '../theme';
import type {
  Machine,
  PreventiveChecklistDefinition,
  PreventiveCompletion,
  PreventiveCompletionInput,
  PreventiveDueState,
  PreventiveFrequency,
  PreventivePlan,
  PreventivePlanInput,
  User,
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

interface PreventiveScreenProps {
  user: User;
}

type DueFilter = 'all' | PreventiveDueState;

type ChecklistDraft = {
  title: string;
  measurementLabel: string;
};

type ResultDraft = {
  completed: boolean;
  measurementValue: string;
  note: string;
};

const frequencyOptions: readonly { value: PreventiveFrequency; label: string }[] = [
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'quarterly', label: '3 Aylık' },
  { value: 'semiannual', label: '6 Aylık' },
  { value: 'annual', label: 'Yıllık' },
  { value: 'working_hours', label: 'Çalışma Saati Bazlı' },
];

const frequencyLabels: Record<PreventiveFrequency, string> = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
  quarterly: '3 Aylık',
  semiannual: '6 Aylık',
  annual: 'Yıllık',
  working_hours: 'Çalışma Saati Bazlı',
};

const dueFilterOptions: readonly { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Tüm planlar' },
  { value: 'overdue', label: 'Geciken' },
  { value: 'due', label: 'Bugün' },
  { value: 'upcoming', label: 'Yaklaşan' },
  { value: 'scheduled', label: 'İleri tarihli' },
];

const dueLabels: Record<PreventiveDueState, string> = {
  overdue: 'Gecikti',
  due: 'Bugün',
  upcoming: 'Yaklaşan',
  scheduled: 'Planlı',
};

function duePalette(state: PreventiveDueState) {
  if (state === 'overdue') return { background: colors.dangerSoft, color: colors.danger };
  if (state === 'due') return { background: colors.warningSoft, color: colors.warning };
  if (state === 'upcoming') return { background: colors.primarySoft, color: colors.primaryDark };
  return { background: colors.neutralSoft, color: colors.inkMuted };
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  } catch {
    return value;
  }
}

function formatDateTime(value: string): string {
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

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function PlanFormModal({
  visible,
  machines,
  technicians,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  machines: Machine[];
  technicians: User[];
  onClose: () => void;
  onSubmit: (input: PreventivePlanInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [frequency, setFrequency] = useState<PreventiveFrequency>('monthly');
  const [assignedTo, setAssignedTo] = useState('');
  const [nextDueDate, setNextDueDate] = useState(defaultDueDate());
  const [intervalHours, setIntervalHours] = useState('500');
  const [runtimeHours, setRuntimeHours] = useState('0');
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([
    { title: '', measurementLabel: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setMachineId(machines[0] ? String(machines[0].id) : '');
    setFrequency('monthly');
    setAssignedTo(technicians[0] ? String(technicians[0].id) : '');
    setNextDueDate(defaultDueDate());
    setIntervalHours('500');
    setRuntimeHours('0');
    setChecklist([{ title: '', measurementLabel: '' }]);
    setError(null);
  }, [machines, technicians, visible]);

  const machineOptions = useMemo(() => machines.map((machine) => ({
    value: String(machine.id),
    label: `${machine.code} · ${machine.name}`,
  })), [machines]);
  const technicianOptions = useMemo(() => technicians.map((technician) => ({
    value: String(technician.id),
    label: technician.name,
  })), [technicians]);

  const updateChecklistItem = (index: number, field: keyof ChecklistDraft, value: string) => {
    setChecklist((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const submit = async () => {
    const cleanChecklist = checklist
      .map((item) => ({ title: item.title.trim(), measurementLabel: item.measurementLabel.trim() }))
      .filter((item) => item.title.length > 0);
    if (!name.trim()) {
      setError('Bakım planı adı zorunludur.');
      return;
    }
    if (!machineId || !assignedTo) {
      setError('Makine ve sorumlu teknisyen seçilmelidir.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate.trim())) {
      setError('Sonraki bakım tarihi YYYY-AA-GG biçiminde olmalıdır.');
      return;
    }
    if (!cleanChecklist.length) {
      setError('En az bir kontrol maddesi eklenmelidir.');
      return;
    }
    const interval = Number(intervalHours);
    const runtime = Number(runtimeHours);
    if (frequency === 'working_hours' && (!Number.isInteger(interval) || interval < 1
      || !Number.isInteger(runtime) || runtime < 0)) {
      setError('Çalışma saati planı için geçerli aralık ve mevcut saat girin.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const checklistPayload: PreventiveChecklistDefinition[] = cleanChecklist.map((item) => ({
        title: item.title,
        ...(item.measurementLabel ? { measurementLabel: item.measurementLabel } : {}),
      }));
      await onSubmit({
        name: name.trim(),
        machineId: Number(machineId),
        frequency,
        assignedTo: Number(assignedTo),
        nextDueDate: nextDueDate.trim(),
        checklist: checklistPayload,
        ...(frequency === 'working_hours' ? { intervalHours: interval, runtimeHours: runtime } : {}),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bakım planı oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet} testID="preventive-plan-modal">
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>PERİYODİK BAKIM PLANI</Text>
              <Text style={styles.modalTitle}>Yeni plan oluştur</Text>
              <Text style={styles.modalSubtitle}>Makine, periyot ve özel kontrol listesini tanımlayın.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <FormField
              label="Bakım planı adı"
              value={name}
              onChangeText={setName}
              placeholder="Örn. CNC spindle yağlama kontrolü"
              maxLength={160}
            />
            <OptionPicker
              label="Makine"
              value={machineId}
              onChange={setMachineId}
              options={machineOptions}
            />
            <OptionPicker
              label="Periyot tipi"
              value={frequency}
              onChange={setFrequency}
              options={frequencyOptions}
            />
            <OptionPicker
              label="Sorumlu teknisyen"
              value={assignedTo}
              onChange={setAssignedTo}
              options={technicianOptions}
            />
            <FormField
              label="Sonraki bakım tarihi"
              value={nextDueDate}
              onChangeText={setNextDueDate}
              placeholder="YYYY-AA-GG"
              autoCapitalize="none"
            />
            {frequency === 'working_hours' ? (
              <View style={styles.twoFieldRow}>
                <FormField
                  label="Bakım aralığı (saat)"
                  value={intervalHours}
                  onChangeText={setIntervalHours}
                  keyboardType="number-pad"
                  containerStyle={styles.twoField}
                />
                <FormField
                  label="Mevcut çalışma saati"
                  value={runtimeHours}
                  onChangeText={setRuntimeHours}
                  keyboardType="number-pad"
                  containerStyle={styles.twoField}
                />
              </View>
            ) : null}

            <View style={styles.checklistHeader}>
              <View>
                <Text style={styles.formSectionTitle}>Kontrol listesi</Text>
                <Text style={styles.formSectionHint}>Her satır bir kontrol maddesidir.</Text>
              </View>
              <Button
                title="Madde ekle"
                onPress={() => setChecklist((current) => [...current, { title: '', measurementLabel: '' }])}
                variant="secondary"
                compact
              />
            </View>
            <View style={styles.checklistDefinitions}>
              {checklist.map((item, index) => (
                <Card key={`checklist-${index}`} style={styles.checklistDefinition}>
                  <View style={styles.checklistDefinitionHeader}>
                    <Text style={styles.checklistNumber}>{index + 1}</Text>
                    {checklist.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${index + 1}. kontrol maddesini kaldır`}
                        onPress={() => setChecklist((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeButtonText}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <FormField
                    label="Kontrol maddesi"
                    value={item.title}
                    onChangeText={(value) => updateChecklistItem(index, 'title', value)}
                    placeholder="Örn. Yağ seviyesi kontrolü"
                    maxLength={200}
                  />
                  <FormField
                    label="Ölçüm etiketi (opsiyonel)"
                    value={item.measurementLabel}
                    onChangeText={(value) => updateChecklistItem(index, 'measurementLabel', value)}
                    placeholder="Örn. mm"
                    maxLength={80}
                  />
                </Card>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Planı oluştur" onPress={() => void submit()} loading={submitting} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CompletionModal({
  plan,
  visible,
  onClose,
  onSubmit,
}: {
  plan: PreventivePlan | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: PreventiveCompletionInput) => Promise<void>;
}) {
  const [results, setResults] = useState<Record<number, ResultDraft>>({});
  const [notes, setNotes] = useState('');
  const [runtimeHours, setRuntimeHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !plan) return;
    const initial: Record<number, ResultDraft> = {};
    for (const item of plan.checklistItems) {
      initial[item.id] = { completed: false, measurementValue: '', note: '' };
    }
    setResults(initial);
    setNotes('');
    setRuntimeHours(
      plan.nextDueRuntimeHours !== null && plan.intervalHours !== null
        ? String(Math.max(0, plan.nextDueRuntimeHours - plan.intervalHours))
        : '',
    );
    setError(null);
  }, [plan, visible]);

  const updateResult = (itemId: number, field: keyof ResultDraft, value: string | boolean) => {
    setResults((current) => ({
      ...current,
      [itemId]: {
        completed: current[itemId]?.completed ?? false,
        measurementValue: current[itemId]?.measurementValue ?? '',
        note: current[itemId]?.note ?? '',
        [field]: value,
      },
    }));
  };

  const submit = async () => {
    if (!plan) return;
    const missing = plan.checklistItems.filter((item) => !results[item.id]?.completed);
    if (missing.length) {
      setError('Tüm kontrol maddeleri işaretlenmeden bakım tamamlanamaz.');
      return;
    }
    const missingMeasurement = plan.checklistItems.find((item) => (
      item.measurementLabel && !results[item.id]?.measurementValue.trim()
    ));
    if (missingMeasurement) {
      setError(`${missingMeasurement.title} için ölçüm değeri girilmelidir.`);
      return;
    }
    const runtime = Number(runtimeHours);
    if (plan.frequency === 'working_hours' && (!Number.isInteger(runtime) || runtime < 0)) {
      setError('Güncel çalışma saati girilmelidir.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        checklistResults: plan.checklistItems.map((item) => ({
          itemId: item.id,
          completed: true,
          measurementValue: results[item.id]?.measurementValue.trim() || null,
          note: results[item.id]?.note.trim() || null,
        })),
        notes: notes.trim() || null,
        ...(plan.frequency === 'working_hours' ? { runtimeHours: runtime } : {}),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bakım kaydı tamamlanamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet} testID="preventive-completion-modal">
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>BAKIM İCRASI</Text>
              <Text style={styles.modalTitle}>{plan?.code ?? ''}</Text>
              <Text style={styles.modalSubtitle}>Her kontrol maddesini işaretleyip ölçüm veya not ekleyin.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {plan?.checklistItems.map((item, index) => {
              const draft = results[item.id] ?? { completed: false, measurementValue: '', note: '' };
              return (
                <Card key={item.id} style={styles.executionItem}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: draft.completed }}
                    accessibilityLabel={`${item.title} kontrol maddesi`}
                    onPress={() => updateResult(item.id, 'completed', !draft.completed)}
                    style={styles.checklistToggleRow}
                  >
                    <View style={[styles.checkbox, draft.completed && styles.checkboxChecked]}>
                      {draft.completed ? <Text style={styles.checkboxCheck}>✓</Text> : null}
                    </View>
                    <View style={styles.checklistToggleCopy}>
                      <Text style={styles.executionNumber}>Kontrol {index + 1}</Text>
                      <Text style={styles.executionTitle}>{item.title}</Text>
                    </View>
                  </Pressable>
                  {item.measurementLabel ? (
                    <FormField
                      label={`${item.measurementLabel} ölçüm değeri`}
                      value={draft.measurementValue}
                      onChangeText={(value) => updateResult(item.id, 'measurementValue', value)}
                      placeholder="Örn. 42"
                      keyboardType="decimal-pad"
                    />
                  ) : null}
                  <FormField
                    label="Madde notu (opsiyonel)"
                    value={draft.note}
                    onChangeText={(value) => updateResult(item.id, 'note', value)}
                    placeholder="Gözlem veya sapma notu"
                    maxLength={2000}
                  />
                </Card>
              );
            })}
            {plan?.frequency === 'working_hours' ? (
              <FormField
                label="Güncel toplam çalışma saati"
                value={runtimeHours}
                onChangeText={setRuntimeHours}
                keyboardType="number-pad"
              />
            ) : null}
            <FormField
              label="Bakım özeti (opsiyonel)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Bakımda yapılan işlemlerin özeti"
              multiline
              maxLength={4000}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Bakımı tamamla" onPress={() => void submit()} loading={submitting} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function HistoryModal({
  plan,
  completions,
  visible,
  loading,
  onClose,
}: {
  plan: PreventivePlan | null;
  completions: PreventiveCompletion[];
  visible: boolean;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>BAKIM GEÇMİŞİ</Text>
              <Text style={styles.modalTitle}>{plan?.code ?? ''}</Text>
              <Text style={styles.modalSubtitle}>Tamamlanan kontrol listeleri ve sonraki bakım tarihleri.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {loading ? <LoadingState label="Bakım geçmişi hazırlanıyor…" /> : null}
            {!loading && !completions.length ? (
              <EmptyState title="Henüz tamamlanmış bakım yok" description="İlk kontrol listesi icrası burada kaydedilecek." />
            ) : null}
            {!loading && completions.map((completion) => (
              <Card key={completion.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{formatDateTime(completion.completedAt)}</Text>
                  <Text style={styles.historyTechnician}>{completion.completedByUser.name}</Text>
                </View>
                {completion.notes ? <Text style={styles.historyNotes}>{completion.notes}</Text> : null}
                {completion.results.map((result) => (
                  <View key={result.itemId} style={styles.historyResult}>
                    <Text style={styles.historyResultTitle}>✓ {result.title}</Text>
                    {result.measurementValue ? (
                      <Text style={styles.historyResultMeta}>Ölçüm: {result.measurementValue}</Text>
                    ) : null}
                    {result.note ? <Text style={styles.historyResultMeta}>{result.note}</Text> : null}
                  </View>
                ))}
                <Text style={styles.nextDueText}>Sonraki bakım: {formatDate(completion.nextDueDate)}</Text>
              </Card>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function PreventiveScreen({ user }: PreventiveScreenProps) {
  const [plans, setPlans] = useState<PreventivePlan[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [completingPlan, setCompletingPlan] = useState<PreventivePlan | null>(null);
  const [historyPlan, setHistoryPlan] = useState<PreventivePlan | null>(null);
  const [historyCompletions, setHistoryCompletions] = useState<PreventiveCompletion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [planResponse, machineResponse, userResponse] = await Promise.all([
        api.getPreventivePlans(user.id),
        api.getMachines(user.id),
        api.getDemoUsers(),
      ]);
      setPlans(planResponse.plans);
      setMachines(machineResponse.machines);
      setTechnicians(userResponse.users.filter((candidate) => candidate.role === 'technician'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bakım planları alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePlans = useMemo(() => plans
    .filter((plan) => dueFilter === 'all' || plan.dueState === dueFilter)
    .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate)), [dueFilter, plans]);

  const createPlan = async (input: PreventivePlanInput) => {
    const response = await api.createPreventivePlan(user.id, input);
    setCreateVisible(false);
    setActionMessage(`${response.plan.code} numaralı periyodik bakım planı oluşturuldu.`);
    await load(true);
  };

  const completePlan = async (payload: PreventiveCompletionInput) => {
    if (!completingPlan) return;
    const response = await api.completePreventivePlan(user.id, completingPlan.id, payload);
    setCompletingPlan(null);
    setActionMessage(`${response.plan.code} tamamlandı; sonraki bakım ${formatDate(response.plan.nextDueDate)} tarihine planlandı.`);
    await load(true);
  };

  const openHistory = async (plan: PreventivePlan) => {
    setHistoryPlan(plan);
    setHistoryCompletions([]);
    setHistoryLoading(true);
    try {
      const response = await api.getPreventiveCompletions(user.id, plan.id);
      setHistoryCompletions(response.completions);
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Bakım geçmişi alınamadı.');
      setHistoryPlan(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const renderPlan = (plan: PreventivePlan) => {
    const palette = duePalette(plan.dueState);
    const canComplete = user.role === 'admin' || plan.assignedToId === user.id;
    return (
      <Card key={plan.id} style={styles.planCard} testID={`preventive-plan-${plan.code}`}>
        <View style={styles.planTopRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{plan.code}</Text>
          </View>
          <View style={[styles.dueBadge, { backgroundColor: palette.background }]}>
            <View style={[styles.dueDot, { backgroundColor: palette.color }]} />
            <Text style={[styles.dueBadgeText, { color: palette.color }]}>{dueLabels[plan.dueState]}</Text>
          </View>
        </View>
        <Text style={styles.planTitle}>{plan.name}</Text>
        <Text style={styles.planMachine}>{plan.machine.code} · {plan.machine.name} · {plan.machine.line}</Text>
        <View style={styles.planMetaGrid}>
          <View style={styles.planMetaBlock}>
            <Text style={styles.planMetaLabel}>Periyot</Text>
            <Text style={styles.planMetaValue}>{frequencyLabels[plan.frequency]}</Text>
          </View>
          <View style={styles.planMetaBlock}>
            <Text style={styles.planMetaLabel}>Sorumlu</Text>
            <Text style={styles.planMetaValue}>{plan.assignedTo?.name ?? 'Atanmadı'}</Text>
          </View>
          <View style={styles.planMetaBlock}>
            <Text style={styles.planMetaLabel}>Sonraki bakım</Text>
            <Text style={[styles.planMetaValue, { color: palette.color }]}>{formatDate(plan.nextDueDate)}</Text>
          </View>
        </View>
        {plan.frequency === 'working_hours' ? (
          <Text style={styles.runtimeText}>
            Çalışma saati eşiği: {plan.nextDueRuntimeHours ?? '—'} saat
            {plan.intervalHours ? ` · ${plan.intervalHours} saatlik aralık` : ''}
          </Text>
        ) : null}
        <View style={styles.planFooter}>
          <Text style={styles.planFooterText}>{plan.checklistItems.length} kontrol maddesi</Text>
          <Text style={styles.planFooterText}>
            {plan.lastCompletedAt ? `Son bakım ${formatDate(plan.lastCompletedAt)}` : 'Henüz tamamlanmadı'}
          </Text>
        </View>
        <View style={styles.planActions}>
          {canComplete ? (
            <Button
              title="Kontrol listesini uygula"
              onPress={() => setCompletingPlan(plan)}
              compact
              style={styles.planAction}
            />
          ) : null}
          <Button
            title="Bakım geçmişi"
            onPress={() => void openHistory(plan)}
            variant="secondary"
            compact
            style={styles.planAction}
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container} testID="preventive-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PERİYODİK BAKIM TAKVİMİ</Text>
            <Text style={styles.title}>Bakım Planları</Text>
            <Text style={styles.subtitle}>Yaklaşan bakımları izleyin, kontrol listelerini saha sonunda tamamlayın.</Text>
          </View>
          {user.role === 'admin' ? (
            <Button title="+ Yeni plan" onPress={() => setCreateVisible(true)} compact />
          ) : null}
        </View>

        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Bakım zaman durumu</Text>
          <FilterChips value={dueFilter} options={dueFilterOptions} onChange={setDueFilter} />
        </View>

        {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
        {loading && !plans.length ? <LoadingState label="Periyodik bakım planları hazırlanıyor…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!loading && !error ? (
          <View style={styles.list}>
            <SectionTitle
              title="Bakım takvimi"
              action={<Text style={styles.resultCount}>{visiblePlans.length} plan</Text>}
            />
            {visiblePlans.length ? visiblePlans.map(renderPlan) : (
              <Card>
                <EmptyState
                  title="Bu durumda plan yok"
                  description="Filtreyi değiştirin veya yeni bir periyodik bakım planı oluşturun."
                />
              </Card>
            )}
          </View>
        ) : null}
      </ScrollView>

      <PlanFormModal
        visible={createVisible}
        machines={machines}
        technicians={technicians}
        onClose={() => setCreateVisible(false)}
        onSubmit={createPlan}
      />
      <CompletionModal
        plan={completingPlan}
        visible={Boolean(completingPlan)}
        onClose={() => setCompletingPlan(null)}
        onSubmit={completePlan}
      />
      <HistoryModal
        plan={historyPlan}
        completions={historyCompletions}
        visible={Boolean(historyPlan)}
        loading={historyLoading}
        onClose={() => setHistoryPlan(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  filterBlock: { gap: spacing.sm },
  filterLabel: { ...typography.label, color: colors.ink },
  list: { gap: spacing.md },
  resultCount: { ...typography.caption, color: colors.inkMuted },
  planCard: { gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.primary },
  planTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  codeBox: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm },
  codeText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.3 },
  dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  dueDot: { width: 7, height: 7, borderRadius: 4 },
  dueBadgeText: { ...typography.caption, fontWeight: '800' },
  planTitle: { ...typography.subheading, color: colors.ink, marginTop: 2 },
  planMachine: { ...typography.caption, color: colors.inkMuted },
  planMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  planMetaBlock: { flexGrow: 1, flexBasis: '28%', minWidth: 130, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  planMetaLabel: { ...typography.caption, color: colors.inkMuted },
  planMetaValue: { ...typography.label, color: colors.ink },
  runtimeText: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.sm },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  planFooterText: { ...typography.caption, color: colors.inkMuted },
  planActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  planAction: { flexGrow: 1, minWidth: 150 },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  modalSheet: { width: '100%', maxWidth: 720, alignSelf: 'center', maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1, gap: 2 },
  modalTitle: { ...typography.heading, color: colors.ink },
  modalSubtitle: { ...typography.caption, color: colors.inkMuted },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  twoFieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  twoField: { flexGrow: 1, minWidth: 180 },
  checklistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  formSectionTitle: { ...typography.subheading, color: colors.ink },
  formSectionHint: { ...typography.caption, color: colors.inkMuted },
  checklistDefinitions: { gap: spacing.md },
  checklistDefinition: { gap: 0, borderColor: colors.borderStrong },
  checklistDefinitionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  checklistNumber: { ...typography.label, color: colors.primary },
  removeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: colors.danger, fontSize: 20, fontWeight: '700' },
  executionItem: { gap: spacing.sm },
  checklistToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkboxCheck: { color: colors.white, fontSize: 16, fontWeight: '900' },
  checklistToggleCopy: { flex: 1, gap: 2 },
  executionNumber: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  executionTitle: { ...typography.label, color: colors.ink },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
  historyCard: { gap: spacing.sm },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  historyDate: { ...typography.label, color: colors.ink },
  historyTechnician: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
  historyNotes: { ...typography.body, color: colors.inkMuted },
  historyResult: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  historyResultTitle: { ...typography.label, color: colors.success },
  historyResultMeta: { ...typography.caption, color: colors.inkMuted },
  nextDueText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', marginTop: spacing.sm },
});
