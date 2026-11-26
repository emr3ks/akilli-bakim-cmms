import { useEffect, useState } from 'react';
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
import type { Criticality, Machine, MachineInput, MachineStatus } from '../types';
import { Button, FormField, OptionPicker } from '../ui';

const emptyMachine: MachineInput = {
  code: '',
  name: '',
  line: '',
  brand: '',
  model: '',
  serialNumber: '',
  criticality: 'medium',
  status: 'running',
};

export function MachineFormModal({
  visible,
  machine,
  userId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  machine: Machine | null;
  userId: number;
  onClose: () => void;
  onSaved: (machine: Machine) => void;
}) {
  const [form, setForm] = useState<MachineInput>(emptyMachine);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setForm(machine ? {
      code: machine.code,
      name: machine.name,
      line: machine.line,
      brand: machine.brand,
      model: machine.model,
      serialNumber: machine.serialNumber,
      criticality: machine.criticality,
      status: machine.status,
    } : emptyMachine);
  }, [machine, visible]);

  const update = <K extends keyof MachineInput>(key: K, value: MachineInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setError(null);
    if (!/^MCH-\d{4}-\d{3}$/.test(form.code.trim())) {
      setError('Makine kodu MCH-YYYY-NNN biçiminde olmalı.');
      return;
    }
    const required = [form.name, form.line, form.brand, form.model, form.serialNumber];
    if (required.some((value) => !value.trim())) {
      setError('Tüm makine bilgileri zorunludur.');
      return;
    }

    setSaving(true);
    try {
      const response = machine
        ? await api.updateMachine(userId, machine.id, form)
        : await api.createMachine(userId, form);
      onSaved(response.machine);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>MAKİNE ENVANTERİ</Text>
              <Text style={styles.title}>{machine ? 'Makineyi düzenle' : 'Yeni makine ekle'}</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
            <FormField
              label="Makine kodu"
              value={form.code}
              onChangeText={(value) => update('code', value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="MCH-2026-008"
              maxLength={12}
            />
            <FormField label="Makine adı" value={form.name} onChangeText={(value) => update('name', value)} placeholder="Örn. CNC Freze Merkezi" />
            <FormField label="Üretim hattı / bölge" value={form.line} onChangeText={(value) => update('line', value)} placeholder="Örn. İşleme Hattı A" />
            <View style={styles.twoColumns}>
              <FormField label="Marka" value={form.brand} onChangeText={(value) => update('brand', value)} placeholder="Marka" containerStyle={styles.column} />
              <FormField label="Model" value={form.model} onChangeText={(value) => update('model', value)} placeholder="Model" containerStyle={styles.column} />
            </View>
            <FormField label="Seri numarası" value={form.serialNumber} onChangeText={(value) => update('serialNumber', value)} placeholder="Seri numarası" />
            <OptionPicker
              label="Kritik seviye"
              value={form.criticality}
              onChange={(value: Criticality) => update('criticality', value)}
              options={[
                { value: 'high', label: 'Yüksek' },
                { value: 'medium', label: 'Orta' },
                { value: 'low', label: 'Düşük' },
              ]}
            />
            <OptionPicker
              label="Anlık durum"
              value={form.status}
              onChange={(value: MachineStatus) => update('status', value)}
              options={[
                { value: 'running', label: 'Çalışıyor' },
                { value: 'maintenance', label: 'Bakımda' },
                { value: 'faulted', label: 'Arızalı' },
                { value: 'stopped', label: 'Duruşta' },
              ]}
            />
            <Button title={machine ? 'Değişiklikleri kaydet' : 'Makineyi kaydet'} onPress={() => void save()} loading={saving} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6, 18, 36, 0.58)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink, marginTop: 2 },
  form: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  column: { flexGrow: 1, flexBasis: '45%' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { ...typography.caption, color: colors.danger },
});
