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
import { PhotoPicker, type SelectedPhoto } from './PhotoPicker';
import { colors, radius, shadow, spacing, typography } from '../theme';
import type { Fault, FaultCategory, FaultUrgency, Machine, User } from '../types';
import { Button, FormField, OptionPicker } from '../ui';

interface FaultReportModalProps {
  visible: boolean;
  machine: Machine;
  user: User;
  onClose: () => void;
  onReported: (fault: Fault) => void;
}

const categoryOptions: readonly { value: FaultCategory; label: string }[] = [
  { value: 'mechanical', label: 'Mekanik' },
  { value: 'electrical', label: 'Elektrik' },
  { value: 'pneumatic_hydraulic', label: 'Pnömatik / Hidrolik' },
  { value: 'software_sensor', label: 'Yazılım / Sensör' },
  { value: 'other', label: 'Diğer' },
];

const urgencyOptions: readonly { value: FaultUrgency; label: string }[] = [
  { value: 'critical', label: 'Kritik - Hat Durdu' },
  { value: 'high', label: 'Yüksek' },
  { value: 'medium', label: 'Orta' },
  { value: 'low', label: 'Düşük' },
];

export function FaultReportModal({ visible, machine, user, onClose, onReported }: FaultReportModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FaultCategory>('mechanical');
  const [urgency, setUrgency] = useState<FaultUrgency>('high');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setCategory('mechanical');
    setUrgency('high');
    setDescription('');
    setPhoto(null);
    setError(null);
  }, [visible, machine.id]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Arıza başlığı zorunludur.');
      return;
    }
    if (!description.trim()) {
      setError('Arıza açıklaması zorunludur.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await api.createFault(user.id, machine.id, {
        title,
        category,
        urgency,
        description,
        photoBase64: photo?.base64 ?? null,
        photoMimeType: photo?.mimeType ?? null,
      });
      onReported(response.fault);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Arıza bildirimi oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet} testID="fault-report-modal">
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>HIZLI ARIZA BİLDİRİMİ</Text>
              <Text style={styles.title}>Arıza bildir</Text>
              <Text style={styles.subtitle}>{machine.code} · {machine.name}</Text>
            </View>
            <Button title="Kapat" onPress={onClose} variant="ghost" compact />
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <FormField
              label="Arıza başlığı"
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. CNC ekseni beklenmedik şekilde durdu"
              maxLength={160}
              testID="fault-title"
            />
            <OptionPicker
              label="Arıza kategorisi"
              value={category}
              onChange={setCategory}
              options={categoryOptions}
            />
            <OptionPicker
              label="Aciliyet"
              value={urgency}
              onChange={setUrgency}
              options={urgencyOptions}
            />
            <FormField
              label="Detaylı açıklama"
              value={description}
              onChangeText={setDescription}
              placeholder="Belirti, hat etkisi ve saha gözlemlerini yazın…"
              multiline
              maxLength={4000}
              testID="fault-description"
            />
            <PhotoPicker value={photo} onChange={setPhoto} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title="Arıza bildirimini gönder"
              onPress={() => void submit()}
              loading={submitting}
              variant={urgency === 'critical' ? 'danger' : 'primary'}
              testID="submit-fault"
            />
            {urgency === 'critical' ? (
              <Text style={styles.criticalHint}>Kritik bildirimde makine otomatik olarak “Arızalı” durumuna geçer.</Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 27, 51, 0.52)' },
  sheet: { maxHeight: '94%', minHeight: '72%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden', ...shadow },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1 },
  title: { ...typography.heading, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkMuted },
  form: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.md },
  criticalHint: { ...typography.caption, color: colors.warning, textAlign: 'center' },
});
