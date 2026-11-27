import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { formatCurrency, formatQuantity, sparePartCategoryLabels, sparePartUnitLabels } from '../spareParts';
import type { PartUsage, SparePart } from '../types';
import { Button, Card, EmptyState, ErrorState, FormField, LoadingState } from '../ui';

export type PartUsageOwner = 'workOrder' | 'preventivePlan';

interface PartUsageModalProps {
  visible: boolean;
  ownerType: PartUsageOwner;
  ownerId: number | null;
  ownerCode: string;
  userId: number;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

export function PartUsageModal({
  visible,
  ownerType,
  ownerId,
  ownerCode,
  userId,
  onClose,
  onChanged,
}: PartUsageModalProps) {
  const [usages, setUsages] = useState<PartUsage[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedPart, setSelectedPart] = useState<SparePart | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [draftQuantities, setDraftQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const [partResult, usageResult] = await Promise.allSettled([
        api.getSpareParts(userId),
        ownerType === 'workOrder'
          ? api.getWorkOrderParts(userId, ownerId)
          : api.getPreventivePlanParts(userId, ownerId),
      ]);
      setParts(partResult.status === 'fulfilled' ? partResult.value.parts : []);
      if (usageResult.status === 'fulfilled') {
        setUsages(usageResult.value.parts);
        setTotalCost(usageResult.value.totalCost);
        setDraftQuantities(Object.fromEntries(
          usageResult.value.parts.map((usage) => [usage.id, String(usage.quantity)]),
        ));
      } else {
        setUsages([]);
        setTotalCost(0);
        setError(usageResult.reason instanceof Error
          ? usageResult.reason.message
          : 'Parça kullanımları alınamadı.');
      }
      if (partResult.status === 'rejected') {
        setError('Parça kataloğu yüklenemedi; mevcut kullanım kayıtları korunuyor.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Parça kullanımları alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType, userId]);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelectedPart(null);
    setQuantity('1');
    setError(null);
    void load();
  }, [load, visible]);

  const filteredParts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return parts.slice(0, 6);
    return parts.filter((part) => (
      part.code.toLowerCase().includes(normalized)
      || part.name.toLowerCase().includes(normalized)
      || sparePartCategoryLabels[part.category].toLowerCase().includes(normalized)
    )).slice(0, 6);
  }, [parts, search]);

  const existingUsage = selectedPart
    ? usages.find((usage) => usage.partId === selectedPart.id) ?? null
    : null;

  const refreshAfterChange = async () => {
    if (!ownerId) return;
    const [partResponse, response] = await Promise.all([
      api.getSpareParts(userId),
      ownerType === 'workOrder'
        ? api.getWorkOrderParts(userId, ownerId)
        : api.getPreventivePlanParts(userId, ownerId),
    ]);
    setParts(partResponse.parts);
    setUsages(response.parts);
    setTotalCost(response.totalCost);
    setDraftQuantities(Object.fromEntries(
      response.parts.map((usage) => [usage.id, String(usage.quantity)]),
    ));
    await onChanged?.();
  };

  const addUsage = async () => {
    if (!selectedPart || !ownerId) {
      setError('Kullanılacak parçayı seçin.');
      return;
    }
    const requested = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(requested) || requested <= 0) {
      setError('Miktar 0’dan büyük bir sayı olmalıdır.');
      return;
    }
    const available = selectedPart.currentStock + (existingUsage?.quantity ?? 0);
    if (requested > available) {
      setError(
        `Yetersiz stok: ${selectedPart.code} için kullanılabilir miktar ${formatQuantity(available)} ${sparePartUnitLabels[selectedPart.unit]}.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (existingUsage) {
        await (ownerType === 'workOrder'
          ? api.updateWorkOrderPart(userId, ownerId, existingUsage.id, {
            partId: selectedPart.id,
            quantity: requested,
          })
          : api.updatePreventivePlanPart(userId, ownerId, existingUsage.id, {
            partId: selectedPart.id,
            quantity: requested,
          }));
      } else {
        await (ownerType === 'workOrder'
          ? api.addWorkOrderPart(userId, ownerId, { partId: selectedPart.id, quantity: requested })
          : api.addPreventivePlanPart(userId, ownerId, { partId: selectedPart.id, quantity: requested }));
      }
      setSelectedPart(null);
      setQuantity('1');
      setSearch('');
      await refreshAfterChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Parça kullanımı kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const updateUsage = async (usage: PartUsage) => {
    if (!ownerId) return;
    const requested = Number(draftQuantities[usage.id] ?? usage.quantity);
    if (!Number.isFinite(requested) || requested <= 0) {
      setError('Parça miktarı 0’dan büyük bir sayı olmalıdır.');
      return;
    }
    const available = usage.part.currentStock + usage.quantity;
    if (requested > available) {
      setError(
        `Yetersiz stok: ${usage.part.code} için kullanılabilir miktar ${formatQuantity(available)} ${sparePartUnitLabels[usage.part.unit]}.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await (ownerType === 'workOrder'
        ? api.updateWorkOrderPart(userId, ownerId, usage.id, { partId: usage.partId, quantity: requested })
        : api.updatePreventivePlanPart(userId, ownerId, usage.id, { partId: usage.partId, quantity: requested }));
      await refreshAfterChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Parça miktarı güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const removeUsage = async (usage: PartUsage) => {
    if (!ownerId) return;
    const performRemove = async () => {
      setSaving(true);
      setError(null);
      try {
        await (ownerType === 'workOrder'
          ? api.removeWorkOrderPart(userId, ownerId, usage.id)
          : api.removePreventivePlanPart(userId, ownerId, usage.id));
        await refreshAfterChange();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Parça kullanımı kaldırılamadı.');
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined'
        && window.confirm(`${usage.part.code} parçasının kullanımını kaldırmak istediğinize emin misiniz? Stok iade edilecek.`);
      if (confirmed) await performRemove();
      return;
    }

    Alert.alert(
      'Parçayı kaldır',
      `${usage.part.code} parçasının kullanımı kaldırılacak ve stok iade edilecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Kaldır', style: 'destructive', onPress: () => void performRemove() },
      ],
    );
  };

  const title = ownerType === 'workOrder' ? 'İş emri parça kullanımı' : 'Bakım planı parça kullanımı';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet} testID="part-usage-modal">
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.eyebrow}>STOK KULLANIMI</Text>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{ownerCode} · Miktar, stoktan düşülür; kaldırma stoğu iade eder.</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {loading ? <LoadingState label="Parça kullanımları hazırlanıyor…" /> : null}
            {!loading && error && !usages.length && !parts.length ? (
              <ErrorState message={error} onRetry={() => void load()} />
            ) : null}

            {!loading ? (
              <>
                <Card style={styles.costCard} testID="part-usage-total-cost">
                  <View style={styles.costHeader}>
                    <View style={styles.costCopy}>
                      <Text style={styles.costLabel}>Toplam parça maliyeti</Text>
                      <Text style={styles.costValue}>{formatCurrency(totalCost)}</Text>
                    </View>
                    <View style={styles.countPill}>
                      <Text style={styles.countText}>{usages.length} kalem</Text>
                    </View>
                  </View>
                </Card>

                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>Parça ekle</Text>
                    <Text style={styles.sectionHint}>Stokta yeterli ürünü seçin ve kullanım miktarını girin.</Text>
                  </View>
                </View>

                <Card style={styles.formCard}>
                  <View style={styles.searchBox}>
                    <Text style={styles.searchIcon}>⌕</Text>
                    <TextInput
                      accessibilityLabel="Kullanılacak parça ara"
                      testID="part-usage-part-search"
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Parça kodu, adı veya kategori ara…"
                      placeholderTextColor={colors.inkMuted}
                      style={styles.searchInput}
                    />
                    {search ? (
                      <Pressable accessibilityLabel="Parça aramasını temizle" onPress={() => setSearch('')} style={styles.clearButton}>
                        <Text style={styles.clearText}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {selectedPart ? (
                    <View style={styles.selectedPart}>
                      <View style={styles.selectedPartCopy}>
                        <Text style={styles.selectedPartCode}>{selectedPart.code}</Text>
                        <Text style={styles.selectedPartName}>{selectedPart.name}</Text>
                        <Text style={styles.selectedPartMeta}>
                          Stok: {formatQuantity(selectedPart.currentStock)} {sparePartUnitLabels[selectedPart.unit]}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Seçili parçayı kaldır"
                        onPress={() => setSelectedPart(null)}
                        style={styles.clearButton}
                      >
                        <Text style={styles.clearText}>×</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.partResults}>
                      {filteredParts.length ? filteredParts.map((part) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${part.code} ${part.name} parçasını seç`}
                          testID={`part-usage-option-${part.code}`}
                          key={part.id}
                          onPress={() => setSelectedPart(part)}
                          style={({ pressed }) => [styles.partOption, pressed && styles.partOptionPressed]}
                        >
                          <View style={styles.partOptionCopy}>
                            <Text style={styles.partOptionCode}>{part.code}</Text>
                            <Text style={styles.partOptionName}>{part.name}</Text>
                            <Text style={styles.partOptionMeta}>
                              Stok {formatQuantity(part.currentStock)} {sparePartUnitLabels[part.unit]} · {sparePartCategoryLabels[part.category]}
                            </Text>
                          </View>
                          <Text style={styles.partOptionArrow}>›</Text>
                        </Pressable>
                      )) : (
                        <Text style={styles.noResults}>Eşleşen parça bulunamadı.</Text>
                      )}
                    </View>
                  )}

                  <FormField
                    label="Kullanım miktarı"
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="Örn. 2"
                    keyboardType="decimal-pad"
                    containerStyle={styles.quantityField}
                  />
                  <Button
                    title={existingUsage ? 'Miktarı güncelle' : 'Parçayı kullan'}
                    onPress={() => void addUsage()}
                    loading={saving}
                    disabled={!selectedPart}
                  />
                </Card>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>Kullanılan parçalar</Text>
                    <Text style={styles.sectionHint}>Miktarı değiştirin veya kullanımı kaldırın.</Text>
                  </View>
                </View>

                {usages.length ? (
                  <View style={styles.usageList}>
                    {usages.map((usage) => (
                      <Card key={usage.id} style={styles.usageCard} testID={`part-usage-${usage.id}`}>
                        <View style={styles.usageHeader}>
                          <View style={styles.usageCopy}>
                            <Text style={styles.usageCode}>{usage.part.code}</Text>
                            <Text style={styles.usageName}>{usage.part.name}</Text>
                          </View>
                          <Text style={styles.usageCost}>{formatCurrency(usage.totalCost)}</Text>
                        </View>
                        <Text style={styles.usageMeta}>
                          {formatQuantity(usage.quantity)} {sparePartUnitLabels[usage.part.unit]} · Birim maliyet {formatCurrency(usage.unitCost)}
                        </Text>
                        <View style={styles.updateRow}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${usage.part.code} miktarını azalt`}
                            onPress={() => setDraftQuantities((current) => ({
                              ...current,
                              [usage.id]: String(Math.max(0, Number(current[usage.id] ?? usage.quantity) - 1)),
                            }))}
                            style={styles.stepButton}
                          >
                            <Text style={styles.stepButtonText}>−</Text>
                          </Pressable>
                          <TextInput
                            accessibilityLabel={`${usage.part.code} kullanım miktarı`}
                            value={draftQuantities[usage.id] ?? String(usage.quantity)}
                            onChangeText={(value) => setDraftQuantities((current) => ({ ...current, [usage.id]: value }))}
                            keyboardType="decimal-pad"
                            style={styles.quantityInput}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${usage.part.code} miktarını artır`}
                            onPress={() => setDraftQuantities((current) => ({
                              ...current,
                              [usage.id]: String(Number(current[usage.id] ?? usage.quantity) + 1),
                            }))}
                            style={styles.stepButton}
                          >
                            <Text style={styles.stepButtonText}>+</Text>
                          </Pressable>
                          <Button
                            title="Güncelle"
                            onPress={() => void updateUsage(usage)}
                            loading={saving}
                            variant="secondary"
                            compact
                            style={styles.updateButton}
                          />
                        </View>
                        <Button
                          title="Kullanımı kaldır ve stoğu iade et"
                          onPress={() => void removeUsage(usage)}
                          variant="danger"
                          compact
                          disabled={saving}
                        />
                      </Card>
                    ))}
                  </View>
                ) : (
                  <Card>
                    <EmptyState
                      title="Henüz parça kullanımı yok"
                      description="Stoktan düşülecek parçayı seçerek kullanım kaydı oluşturun."
                    />
                  </Card>
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  modalSheet: { width: '100%', maxWidth: 720, alignSelf: 'center', maxHeight: '92%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface },
  modalHeaderCopy: { flex: 1, gap: 2 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  modalTitle: { ...typography.heading, color: colors.ink },
  modalSubtitle: { ...typography.caption, color: colors.inkMuted },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  costCard: { padding: spacing.md, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  costHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  costCopy: { flex: 1, gap: 2 },
  costLabel: { ...typography.caption, color: colors.primaryDark },
  costValue: { ...typography.heading, color: colors.primaryDark },
  countPill: { backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  countText: { ...typography.caption, color: colors.primaryDark, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitle: { ...typography.subheading, color: colors.ink },
  sectionHint: { ...typography.caption, color: colors.inkMuted },
  formCard: { gap: spacing.md },
  searchBox: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  searchIcon: { color: colors.primary, fontSize: 22, fontWeight: '700' },
  searchInput: { flex: 1, minHeight: 46, color: colors.ink, ...typography.body },
  clearButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.inkMuted, fontSize: 20, lineHeight: 22 },
  partResults: { gap: spacing.sm },
  partOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceAlt },
  partOptionPressed: { opacity: 0.72 },
  partOptionCopy: { flex: 1, gap: 1 },
  partOptionCode: { ...typography.label, color: colors.primaryDark },
  partOptionName: { ...typography.body, color: colors.ink },
  partOptionMeta: { ...typography.caption, color: colors.inkMuted },
  partOptionArrow: { color: colors.primary, fontSize: 24, fontWeight: '700' },
  noResults: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', paddingVertical: spacing.md },
  selectedPart: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  selectedPartCopy: { flex: 1, gap: 2 },
  selectedPartCode: { ...typography.label, color: colors.primaryDark },
  selectedPartName: { ...typography.body, color: colors.ink },
  selectedPartMeta: { ...typography.caption, color: colors.inkMuted },
  quantityField: { marginBottom: 0 },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
  usageList: { gap: spacing.md },
  usageCard: { gap: spacing.sm },
  usageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  usageCopy: { flex: 1, gap: 2 },
  usageCode: { ...typography.label, color: colors.primaryDark },
  usageName: { ...typography.body, color: colors.ink },
  usageCost: { ...typography.label, color: colors.ink, textAlign: 'right' },
  usageMeta: { ...typography.caption, color: colors.inkMuted },
  updateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center' },
  stepButtonText: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  quantityInput: { width: 72, minHeight: 40, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, color: colors.ink, textAlign: 'center', ...typography.body },
  updateButton: { flexGrow: 1 },
});
