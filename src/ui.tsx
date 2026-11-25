import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, shadow, spacing, typography } from './theme';
import type { Criticality, Machine, MachineStatus, Role } from './types';

export const roleLabels: Record<Role, string> = {
  admin: 'Bakım Yöneticisi',
  technician: 'Bakım Teknisyeni',
  operator: 'Operatör',
};

export const statusLabels: Record<MachineStatus, string> = {
  running: 'Çalışıyor',
  maintenance: 'Bakımda',
  faulted: 'Arızalı',
  stopped: 'Duruşta',
};

export const criticalityLabels: Record<Criticality, string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { background: colors.primary, border: colors.primary, text: colors.white },
    secondary: { background: colors.primarySoft, border: colors.primarySoft, text: colors.primaryDark },
    ghost: { background: 'transparent', border: colors.border, text: colors.ink },
    danger: { background: colors.dangerSoft, border: colors.dangerSoft, text: colors.danger },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.background, borderColor: palette.border },
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.text} size="small" /> : null}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: palette.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

export function StatusBadge({ status }: { status: MachineStatus }) {
  const palette = {
    running: { background: colors.successSoft, color: colors.success },
    maintenance: { background: colors.warningSoft, color: colors.warning },
    faulted: { background: colors.dangerSoft, color: colors.danger },
    stopped: { background: colors.neutralSoft, color: colors.neutral },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <View style={[styles.badgeDot, { backgroundColor: palette.color }]} />
      <Text style={[styles.badgeText, { color: palette.color }]}>{statusLabels[status]}</Text>
    </View>
  );
}

export function CriticalityBadge({ criticality }: { criticality: Criticality }) {
  const palette = {
    high: { background: colors.dangerSoft, color: colors.danger },
    medium: { background: colors.warningSoft, color: colors.warning },
    low: { background: colors.successSoft, color: colors.success },
  }[criticality];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.color }]}>{criticalityLabels[criticality]} kritik</Text>
    </View>
  );
}

export function FormField({
  label,
  error,
  containerStyle,
  ...inputProps
}: TextInputProps & { label: string; error?: string; containerStyle?: ViewStyle }) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel || label}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, inputProps.multiline && styles.inputMultiline, error && styles.inputError]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function OptionPicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MachineCard({ machine, onPress, onEdit }: { machine: Machine; onPress: () => void; onEdit?: () => void }) {
  return (
    <View style={styles.machineCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${machine.code} ${machine.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.machineCardContent, pressed && styles.machineCardPressed]}
      >
        <View style={styles.machineTopRow}>
          <View style={styles.machineCodeBox}>
            <Text style={styles.machineCode}>{machine.code}</Text>
          </View>
          <View style={[styles.machineTopActions, onEdit && styles.machineTopActionsWithEdit]}>
            <StatusBadge status={machine.status} />
          </View>
        </View>
        <Text style={styles.machineName}>{machine.name}</Text>
        <Text style={styles.machineMeta}>{machine.line} · {machine.brand} {machine.model}</Text>
        <View style={styles.machineBottomRow}>
          <CriticalityBadge criticality={machine.criticality} />
          <Text style={styles.machineSerial}>SN: {machine.serialNumber}</Text>
        </View>
      </Pressable>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${machine.code} makinesini düzenle`}
          onPress={onEdit}
          style={styles.editAction}
        >
          <Text style={styles.editActionText}>✎</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Veriler yükleniyor…' }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateBox}>
      <View style={styles.errorIcon}><Text style={styles.errorIconText}>!</Text></View>
      <Text style={styles.stateTitle}>Bir şeyler ters gitti</Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? <Button title="Tekrar dene" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View style={styles.stateBox}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌁</Text></View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{description}</Text>
      {action}
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonDisabled: { opacity: 0.5 }
  ,
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonText: { ...typography.label, fontSize: 15 },
  buttonTextCompact: { fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { ...typography.heading, color: colors.ink },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { ...typography.caption, fontWeight: '800' },
  field: { gap: 7, marginBottom: spacing.md },
  fieldLabel: { ...typography.label, color: colors.ink },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  inputMultiline: { minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldError: { ...typography.caption, color: colors.danger },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
  },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  optionTextSelected: { color: colors.white },
  chipScroll: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
  chipTextSelected: { color: colors.white },
  machineCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    position: 'relative',
  },
  machineCardContent: { gap: spacing.sm },
  machineCardPressed: { opacity: 0.75 },
  machineTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  machineTopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  machineTopActionsWithEdit: { marginRight: 38 },
  editAction: { position: 'absolute', top: spacing.md, right: spacing.md, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  editActionText: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  machineCodeBox: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  machineCode: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.3 },
  machineName: { ...typography.subheading, color: colors.ink, marginTop: 2 },
  machineMeta: { ...typography.caption, color: colors.inkMuted },
  machineBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  machineSerial: { ...typography.caption, color: colors.inkMuted, flexShrink: 1, textAlign: 'right' },
  stateBox: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  stateTitle: { ...typography.subheading, color: colors.ink, textAlign: 'center' },
  stateText: { ...typography.body, color: colors.inkMuted, textAlign: 'center', maxWidth: 360 },
  errorIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: { color: colors.danger, fontSize: 24, fontWeight: '900' },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  infoRow: {
    minHeight: 48,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.lg,
  },
  infoLabel: { ...typography.body, color: colors.inkMuted },
  infoValue: { ...typography.label, color: colors.ink, flexShrink: 1, textAlign: 'right' },
});
