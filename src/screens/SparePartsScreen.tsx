import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api';
import { colors, radius, shadow, spacing, typography } from '../theme';
import {
  formatCurrency,
  formatMovementDate,
  formatQuantity,
  sparePartCategoryLabels,
  sparePartStatusLabels,
  sparePartStatusPalette,
  sparePartUnitLabels,
} from '../spareParts';
import type {
  SparePart,
  SparePartCategory,
  SparePartFilters,
  SparePartInput,
  SparePartStatus,
  SparePartUnit,
  StockAlert,
  StockMovement,
  StockMovementType,
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

interface SparePartsScreenProps {
  user: User;
}

type SparePartsView = 'catalog' | 'alerts' | 'history';

const categoryOptions: readonly { value: SparePartCategory | ''; label: string }[] = [
  { value: '', label: 'Tüm kategoriler' },
  { value: 'bearing', label: sparePartCategoryLabels.bearing },
  { value: 'belt_sprocket', label: sparePartCategoryLabels.belt_sprocket },
  { value: 'sensor_automation', label: sparePartCategoryLabels.sensor_automation },
  { value: 'hydraulic_pneumatic', label: sparePartCategoryLabels.hydraulic_pneumatic },
  { value: 'electrical', label: sparePartCategoryLabels.electrical },
  { value: 'consumable', label: sparePartCategoryLabels.consumable },
];

const statusOptions: readonly { value: SparePartStatus | ''; label: string }[] = [
  { value: '', label: 'Tüm stok durumları' },
  { value: 'sufficient', label: sparePartStatusLabels.sufficient },
  { value: 'critical', label: sparePartStatusLabels.critical },
  { value: 'depleted', label: sparePartStatusLabels.depleted },
];

const unitOptions: readonly { value: SparePartUnit; label: string }[] = [
  { value: 'piece', label: sparePartUnitLabels.piece },
  { value: 'meter', label: sparePartUnitLabels.meter },
  { value: 'liter', label: sparePartUnitLabels.liter },
  { value: 'set', label: sparePartUnitLabels.set },
];

const movementTypeLabels: Record<StockMovementType, string> = {
  in: 'Stok Girişi',
  out: 'İş Emri Kullanımı',
  return: 'İade',
};

function movementPalette(type: StockMovementType) {
  if (type === 'in') return { background: colors.successSoft, color: colors.success };
  if (type === 'return') return { background: colors.primarySoft, color: colors.primaryDark };
  return { background: colors.dangerSoft, color: colors.danger };
}

function PartFormModal({
  visible,
  part,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  part: SparePart | null;
  onClose: () => void;
  onSubmit: (input: SparePartInput) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SparePartCategory>('bearing');
  const [compatibleMachine, setCompatibleMachine] = useState('');
  const [unit, setUnit] = useState<SparePartUnit>('piece');
  const [currentStock, setCurrentStock] = useState('0');
  const [minimumStock, setMinimumStock] = useState('0');
  const [location, setLocation] = useState('');
  const [unitCost, setUnitCost] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCode(part?.code ?? '');
    setName(part?.name ?? '');
    setCategory(part?.category ?? 'bearing');
    setCompatibleMachine(part?.compatibleMachine ?? '');
    setUnit(part?.unit ?? 'piece');
    setCurrentStock(String(part?.currentStock ?? 0));
    setMinimumStock(String(part?.minimumStock ?? 0));
    setLocation(part?.location ?? '');
    setUnitCost(String(part?.unitCost ?? 0));
    setError(null);
  }, [part, visible]);

  const submit = async () => {
    const stock = Number(currentStock);
    const minimum = Number(minimumStock);
    const cost = Number(unitCost);
    if (!code.trim() || !name.trim()) {
      setError('Parça kodu ve adı zorunludur.');
      return;
    }
    if (!compatibleMachine.trim()) {
      setError('Marka veya uyumlu makine bilgisi zorunludur.');
      return;
    }
    if (!location.trim()) {
      setError('Raf / depo konumu zorunludur.');
      return;
    }
    if (!currentStock.trim() || !Number.isFinite(stock) || stock < 0) {
      setError('Mevcut stok 0 veya daha büyük bir sayı olmalıdır.');
      return;
    }
    if (!minimumStock.trim() || !Number.isFinite(minimum) || minimum < 0) {
      setError('Minimum stok 0 veya daha büyük bir sayı olmalıdır.');
      return;
    }
    if (!unitCost.trim() || !Number.isFinite(cost) || cost < 0) {
      setError('Birim maliyet 0 veya daha büyük bir sayı olmalıdır.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category,
        compatibleMachine: compatibleMachine.trim(),
        unit,
        currentStock: stock,
        minimumStock: minimum,
        location: location.trim(),
        unitCost: cost,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Yedek parça kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet} testID="spare-part-form-modal">
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>YEDEK PARÇA KATALOĞU</Text>
              <Text style={styles.modalTitle}>{part ? 'Parçayı düzenle' : 'Yeni yedek parça'}</Text>
              <Text style={styles.modalSubtitle}>Kod, uyumluluk, stok seviyesi ve maliyet bilgilerini girin.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <FormField
              label="Parça kodu"
              value={code}
              onChangeText={setCode}
              placeholder="Örn. YDK-2026-001"
              autoCapitalize="characters"
              maxLength={60}
              testID="spare-part-code-input"
            />
            <FormField
              label="Parça adı"
              value={name}
              onChangeText={setName}
              placeholder="Örn. 6204-2RS rulman"
              maxLength={160}
              testID="spare-part-name-input"
            />
            <OptionPicker
              label="Kategori"
              value={category}
              onChange={setCategory}
              options={categoryOptions.filter((option): option is { value: SparePartCategory; label: string } => option.value !== '')}
            />
            <FormField
              label="Marka / uyumlu makine"
              value={compatibleMachine}
              onChangeText={setCompatibleMachine}
              placeholder="Örn. SKF / CNC-01"
              maxLength={160}
            />
            <OptionPicker label="Birim" value={unit} onChange={setUnit} options={unitOptions} />
            <View style={styles.twoFieldRow}>
              <FormField
                label={part ? 'Mevcut stok (stok girişi ile değiştirilir)' : 'Mevcut stok'}
                value={currentStock}
                onChangeText={setCurrentStock}
                editable={!part}
                placeholder="0"
                keyboardType="decimal-pad"
                containerStyle={styles.twoField}
              />
              <FormField
                label="Minimum stok"
                value={minimumStock}
                onChangeText={setMinimumStock}
                placeholder="0"
                keyboardType="decimal-pad"
                containerStyle={styles.twoField}
              />
            </View>
            <FormField
              label="Raf / depo konumu"
              value={location}
              onChangeText={setLocation}
              placeholder="Örn. A-03-12"
              maxLength={120}
            />
            <FormField
              label="Birim maliyet (TL)"
              value={unitCost}
              onChangeText={setUnitCost}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={part ? 'Değişiklikleri kaydet' : 'Parçayı oluştur'}
              onPress={() => void submit()}
              loading={submitting}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StockEntryModal({
  part,
  visible,
  onClose,
  onSubmit,
}: {
  part: SparePart | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (quantity: number, note: string | null) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuantity('');
    setNote('');
    setError(null);
  }, [part?.id, visible]);

  const submit = async () => {
    const amount = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Giriş miktarı 0’dan büyük bir sayı olmalıdır.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(amount, note.trim() || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Stok girişi kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet} testID="spare-part-stock-entry-modal">
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>STOK GİRİŞİ</Text>
              <Text style={styles.modalTitle}>{part?.code ?? ''}</Text>
              <Text style={styles.modalSubtitle}>Satın alma veya depoya giriş miktarını kaydedin.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>
          <View style={styles.modalBody}>
            {part ? (
              <Text style={styles.stockContext}>
                Mevcut stok: {formatQuantity(part.currentStock)} {sparePartUnitLabels[part.unit]}
              </Text>
            ) : null}
            <FormField
              label="Giriş miktarı"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Örn. 10"
              keyboardType="decimal-pad"
              testID="stock-entry-quantity-input"
            />
            <FormField
              label="Açıklama (opsiyonel)"
              value={note}
              onChangeText={setNote}
              placeholder="Satın alma / tedarikçi notu"
              multiline
              maxLength={500}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Stok girişini kaydet" onPress={() => void submit()} loading={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SparePartsScreen({ user }: SparePartsScreenProps) {
  const [view, setView] = useState<SparePartsView>('catalog');
  const [parts, setParts] = useState<SparePart[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SparePartCategory | ''>('');
  const [status, setStatus] = useState<SparePartStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionWarning, setSectionWarning] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [stockEntryPart, setStockEntryPart] = useState<SparePart | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setSectionWarning(null);
    try {
      if (view === 'catalog') {
        const filters: SparePartFilters = { q: query, category, status };
        const response = await api.getSpareParts(user.id, filters);
        setParts(response.parts);
      } else if (view === 'alerts') {
        const [alertResult, partResult] = await Promise.allSettled([
          api.getStockAlerts(user.id),
          api.getSpareParts(user.id),
        ]);
        if (alertResult.status === 'fulfilled') {
          setAlerts(alertResult.value.alerts);
          setAlertCount(alertResult.value.count);
        } else {
          setAlerts([]);
          setAlertCount(0);
          setError(alertResult.reason instanceof Error
            ? alertResult.reason.message
            : 'Kritik stok uyarıları alınamadı.');
        }
        setParts(partResult.status === 'fulfilled' ? partResult.value.parts : []);
        if (partResult.status === 'rejected') {
          setSectionWarning('Parça kataloğu yüklenemedi; uyarı listesi kullanılabilir durumda.');
        }
      } else {
        const response = await api.getStockMovements(user.id);
        setMovements(response.movements);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Yedek parça verileri alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, query, status, user.id, view]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const activeFilterCount = [category, status].filter(Boolean).length;
  const hasContent = view === 'catalog' ? parts.length > 0 : view === 'alerts' ? alerts.length > 0 : movements.length > 0;

  const openCreate = () => {
    setEditingPart(null);
    setFormVisible(true);
  };

  const openEdit = (part: SparePart) => {
    setEditingPart(part);
    setFormVisible(true);
  };

  const savePart = async (input: SparePartInput) => {
    if (editingPart) {
      const editableFields: Partial<SparePartInput> = { ...input };
      delete editableFields.currentStock;
      const response = await api.updateSparePart(user.id, editingPart.id, editableFields);
      setActionMessage(`${response.part.code} parçası güncellendi.`);
    } else {
      const response = await api.createSparePart(user.id, input);
      setActionMessage(`${response.part.code} parçası kataloğa eklendi.`);
    }
    setFormVisible(false);
    setEditingPart(null);
    await load(true);
  };

  const deletePart = (part: SparePart) => {
    const performDelete = async () => {
      try {
        await api.deleteSparePart(user.id, part.id);
        setActionMessage(`${part.code} parçası katalogdan silindi.`);
        await load(true);
      } catch (reason) {
        setActionMessage(reason instanceof Error ? reason.message : 'Yedek parça silinemedi.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined'
        && window.confirm(`${part.code} parçasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`);
      if (confirmed) void performDelete();
      return;
    }

    Alert.alert(
      'Parçayı sil',
      `${part.code} parçası katalogdan silinecek. Hareket geçmişi korunacaktır; bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
  };

  const createStockEntry = async (quantity: number, note: string | null) => {
    if (!stockEntryPart) return;
    const response = await api.createStockMovement(user.id, stockEntryPart.id, { quantity, note });
    setStockEntryPart(null);
    setActionMessage(
      `${response.part.code} için ${formatQuantity(quantity)} ${sparePartUnitLabels[response.part.unit]} stok girişi yapıldı.`,
    );
    await load(true);
  };

  const renderPartCard = (part: SparePart) => {
    const palette = sparePartStatusPalette(part.status);
    return (
      <Card key={part.id} style={styles.partCard} testID={`spare-part-${part.code}`}>
        <View style={styles.partTopRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{part.code}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: palette.background }]}>
            <View style={[styles.statusDot, { backgroundColor: palette.color }]} />
            <Text style={[styles.statusText, { color: palette.color }]}>{sparePartStatusLabels[part.status]}</Text>
          </View>
        </View>
        <Text style={styles.partName}>{part.name}</Text>
        <Text style={styles.partCompatibility}>{part.compatibleMachine}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>{sparePartCategoryLabels[part.category]}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>{sparePartUnitLabels[part.unit]}</Text>
          </View>
        </View>
        <View style={styles.partMetaGrid}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Mevcut stok</Text>
            <Text style={[styles.metaValue, part.status !== 'sufficient' && styles.metaValueAlert]}>
              {formatQuantity(part.currentStock)} {sparePartUnitLabels[part.unit]}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Minimum stok</Text>
            <Text style={styles.metaValue}>{formatQuantity(part.minimumStock)}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Konum</Text>
            <Text style={styles.metaValue}>{part.location}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Birim maliyet</Text>
            <Text style={styles.metaValue}>{formatCurrency(part.unitCost)}</Text>
          </View>
        </View>
        {user.role === 'admin' ? (
          <View style={styles.adminActions}>
            <Button
              title="Düzenle"
              onPress={() => openEdit(part)}
              variant="secondary"
              compact
              style={styles.adminAction}
              testID={`spare-part-edit-${part.code}`}
            />
            <Button
              title="Stok girişi"
              onPress={() => setStockEntryPart(part)}
              compact
              style={styles.adminAction}
              testID={`spare-part-stock-entry-${part.code}`}
            />
            <Button
              title="Sil"
              onPress={() => deletePart(part)}
              variant="danger"
              compact
              style={styles.adminAction}
              testID={`spare-part-delete-${part.code}`}
            />
          </View>
        ) : null}
      </Card>
    );
  };

  const renderAlertCard = (alert: StockAlert) => {
    const palette = sparePartStatusPalette(alert.status);
    return (
      <Card key={alert.id} style={{ ...styles.partCard, ...styles.alertCard }} testID={`spare-part-alert-${alert.code}`}>
        <View style={styles.partTopRow}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{alert.code}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: palette.background }]}>
            <Text style={[styles.statusText, { color: palette.color }]}>{sparePartStatusLabels[alert.status]}</Text>
          </View>
        </View>
        <Text style={styles.partName}>{alert.name}</Text>
        <Text style={styles.partCompatibility}>{sparePartCategoryLabels[alert.category]} · {alert.location}</Text>
        <View style={styles.shortageBox}>
          <Text style={styles.shortageLabel}>Eksik stok</Text>
          <Text style={styles.shortageValue}>
            {formatQuantity(alert.shortage)} {sparePartUnitLabels[alert.unit]}
          </Text>
        </View>
        <Text style={styles.alertMeta}>
          Mevcut {formatQuantity(alert.currentStock)} · Minimum {formatQuantity(alert.minimumStock)} {sparePartUnitLabels[alert.unit]}
        </Text>
        {user.role === 'admin' ? (
          <Button
            title="Stok girişi yap"
            onPress={() => {
              const part = parts.find((candidate) => candidate.id === alert.id);
              if (part) setStockEntryPart(part);
              else setActionMessage('Stok girişi için parça kataloğundan kaydı seçin.');
            }}
            compact
          />
        ) : null}
      </Card>
    );
  };

  const renderMovement = (movement: StockMovement) => {
    const palette = movementPalette(movement.movementType);
    return (
      <Card key={movement.id} style={styles.movementCard} testID={`stock-movement-${movement.id}`}>
        <View style={styles.movementTopRow}>
          <View style={styles.movementCopy}>
            <Text style={styles.movementCode}>{movement.partCode}</Text>
            <Text style={styles.movementName}>{movement.partName}</Text>
          </View>
          <View style={[styles.movementBadge, { backgroundColor: palette.background }]}>
            <Text style={[styles.movementBadgeText, { color: palette.color }]}>{movementTypeLabels[movement.movementType]}</Text>
          </View>
        </View>
        <View style={styles.movementMetrics}>
          <View style={styles.movementMetric}>
            <Text style={styles.metaLabel}>Miktar</Text>
            <Text style={styles.movementMetricValue}>{formatQuantity(movement.quantity)}</Text>
          </View>
          <View style={styles.movementMetric}>
            <Text style={styles.metaLabel}>Toplam maliyet</Text>
            <Text style={styles.movementMetricValue}>{formatCurrency(movement.totalCost)}</Text>
          </View>
          <View style={styles.movementMetric}>
            <Text style={styles.metaLabel}>Birim maliyet</Text>
            <Text style={styles.movementMetricValue}>{formatCurrency(movement.unitCost)}</Text>
          </View>
        </View>
        {movement.note ? <Text style={styles.movementNote}>{movement.note}</Text> : null}
        <View style={styles.movementFooter}>
          <Text style={styles.movementMeta}>{movement.user.name}</Text>
          <Text style={styles.movementMeta}>{formatMovementDate(movement.createdAt)}</Text>
        </View>
        {movement.workOrderId ? <Text style={styles.referenceText}>İş emri #{movement.workOrderId}</Text> : null}
        {movement.preventivePlanId ? <Text style={styles.referenceText}>Bakım planı #{movement.preventivePlanId}</Text> : null}
      </Card>
    );
  };

  return (
    <View style={styles.container} testID="spare-parts-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>YEDEK PARÇA VE MALZEME</Text>
            <Text style={styles.title}>Stok Yönetimi</Text>
            <Text style={styles.subtitle}>Katalog, kritik stok uyarıları ve hareket geçmişini yönetin.</Text>
          </View>
          {user.role === 'admin' && view === 'catalog' ? (
            <Button title="+ Parça ekle" onPress={openCreate} compact testID="spare-part-create" />
          ) : null}
        </View>

        <View style={styles.segmented}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'catalog' }}
            testID="spare-parts-section-catalog"
            onPress={() => setView('catalog')}
            style={[styles.segment, view === 'catalog' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, view === 'catalog' && styles.segmentTextActive]}>Katalog</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'alerts' }}
            testID="spare-parts-section-alerts"
            onPress={() => setView('alerts')}
            style={[styles.segment, view === 'alerts' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, view === 'alerts' && styles.segmentTextActive]}>
              Kritik uyarılar{alertCount ? ` · ${alertCount}` : ''}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'history' }}
            testID="spare-parts-section-history"
            onPress={() => setView('history')}
            style={[styles.segment, view === 'history' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, view === 'history' && styles.segmentTextActive]}>Hareketler</Text>
          </Pressable>
        </View>

        {view === 'catalog' ? (
          <>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                accessibilityLabel="Yedek parça ara"
                testID="spare-part-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Parça kodu, adı veya kategori ara…"
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
                <Text style={styles.filterLabel}>Kategori</Text>
                {activeFilterCount > 0 ? (
                  <Pressable onPress={() => { setCategory(''); setStatus(''); }}>
                    <Text style={styles.clearFilters}>{activeFilterCount} filtreyi temizle</Text>
                  </Pressable>
                ) : null}
              </View>
              <FilterChips value={category} options={categoryOptions} onChange={setCategory} />
            </View>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Stok durumu</Text>
              <FilterChips value={status} options={statusOptions} onChange={setStatus} />
            </View>
          </>
        ) : null}

        {actionMessage ? <Text style={styles.actionMessage}>{actionMessage}</Text> : null}
        {sectionWarning ? <Text style={styles.sectionWarning}>{sectionWarning}</Text> : null}
        {loading && !hasContent ? <LoadingState label="Yedek parça verileri hazırlanıyor…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {!loading && !error ? (
          view === 'catalog' ? (
            <View style={styles.list}>
              <SectionTitle title="Parça kataloğu" action={<Text style={styles.resultCount}>{parts.length} parça</Text>} />
              {parts.length ? parts.map(renderPartCard) : (
                <Card>
                  <EmptyState
                    title="Eşleşen parça bulunamadı"
                    description="Arama veya filtreleri değiştirerek tekrar deneyin."
                    action={activeFilterCount || query ? (
                      <Button
                        title="Filtreleri temizle"
                        onPress={() => { setQuery(''); setCategory(''); setStatus(''); }}
                        variant="secondary"
                        compact
                      />
                    ) : undefined}
                  />
                </Card>
              )}
            </View>
          ) : view === 'alerts' ? (
            <View style={styles.list}>
              <SectionTitle title="Kritik stok uyarıları" action={<Text style={styles.resultCount}>{alertCount} uyarı</Text>} />
              {alerts.length ? alerts.map(renderAlertCard) : (
                <Card>
                  <EmptyState title="Kritik stok uyarısı yok" description="Tüm parçalar minimum stok seviyesinin üzerinde." />
                </Card>
              )}
            </View>
          ) : (
            <View style={styles.list}>
              <SectionTitle title="Stok hareket geçmişi" action={<Text style={styles.resultCount}>{movements.length} hareket</Text>} />
              {movements.length ? movements.map(renderMovement) : (
                <Card>
                  <EmptyState title="Henüz stok hareketi yok" description="Stok girişi, kullanım ve iade hareketleri burada listelenir." />
                </Card>
              )}
            </View>
          )
        ) : null}
      </ScrollView>

      <PartFormModal
        visible={formVisible}
        part={editingPart}
        onClose={() => { setFormVisible(false); setEditingPart(null); }}
        onSubmit={savePart}
      />
      <StockEntryModal
        part={stockEntryPart}
        visible={Boolean(stockEntryPart)}
        onClose={() => setStockEntryPart(null)}
        onSubmit={createStockEntry}
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
  segmented: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { ...typography.caption, color: colors.inkMuted, fontWeight: '800', textAlign: 'center' },
  segmentTextActive: { color: colors.primaryDark },
  searchBox: { minHeight: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
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
  partCard: { gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.primary },
  alertCard: { borderLeftColor: colors.warning },
  partTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  codeBox: { backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm },
  codeText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.caption, fontWeight: '800' },
  partName: { ...typography.subheading, color: colors.ink, marginTop: 2 },
  partCompatibility: { ...typography.caption, color: colors.inkMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoBadge: { backgroundColor: colors.neutralSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  infoBadgeText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  partMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  metaBlock: { flexGrow: 1, flexBasis: '44%', minWidth: 135, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  metaLabel: { ...typography.caption, color: colors.inkMuted },
  metaValue: { ...typography.label, color: colors.ink },
  metaValueAlert: { color: colors.danger },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  adminAction: { flexGrow: 1, minWidth: 105 },
  shortageBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  shortageLabel: { ...typography.label, color: colors.warning },
  shortageValue: { ...typography.subheading, color: colors.warning },
  alertMeta: { ...typography.caption, color: colors.inkMuted },
  movementCard: { gap: spacing.sm },
  movementTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  movementCopy: { flex: 1, gap: 2 },
  movementCode: { ...typography.label, color: colors.primaryDark },
  movementName: { ...typography.body, color: colors.ink },
  movementBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  movementBadgeText: { ...typography.caption, fontWeight: '800' },
  movementMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  movementMetric: { flexGrow: 1, flexBasis: '28%', minWidth: 110, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  movementMetricValue: { ...typography.label, color: colors.ink },
  movementNote: { ...typography.body, color: colors.inkMuted, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.md },
  movementFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  movementMeta: { ...typography.caption, color: colors.inkMuted, flexShrink: 1 },
  referenceText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
  actionMessage: { ...typography.caption, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  sectionWarning: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  modalSheet: { width: '100%', maxWidth: 720, alignSelf: 'center', maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1, gap: 2 },
  modalTitle: { ...typography.heading, color: colors.ink },
  modalSubtitle: { ...typography.caption, color: colors.inkMuted },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  twoFieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  twoField: { flexGrow: 1, minWidth: 180 },
  stockContext: { ...typography.body, color: colors.inkMuted, backgroundColor: colors.primarySoft, borderRadius: radius.sm, padding: spacing.md },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
});
