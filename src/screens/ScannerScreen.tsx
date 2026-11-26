import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { api } from '../api';
import { colors, radius, spacing, typography } from '../theme';
import type { Machine, User } from '../types';
import { Button, Card, ErrorState, SectionTitle, StatusBadge } from '../ui';

interface ScannerScreenProps {
  user: User;
  onOpenMachine: (machine: Machine) => void;
}

export function ScannerScreen({ user, onOpenMachine }: ScannerScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const response = await api.getMachines(user.id);
      setMachines(response.machines);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine listesi alınamadı.');
    }
  }, [user.id]);

  useEffect(() => {
    void loadMachines();
  }, [loadMachines]);

  const openCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      setError('Makine kodu girin.');
      return;
    }
    setLoading(true);
    setError(null);
    setScanned(true);
    try {
      const response = await api.getMachineByCode(user.id, code);
      onOpenMachine(response.machine);
      setScanned(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Makine bulunamadı.');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (!scanned) void openCode(data);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="scanner-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>QR KOD</Text>
        <Text style={styles.title}>Makineyi bul</Text>
        <Text style={styles.subtitle}>QR etiketini okutarak veya makine kodunu girerek hızlıca kartına ulaşın.</Text>
      </View>

      <Card style={styles.cameraCard}>
        <View style={styles.cameraHeader}>
          <View>
            <Text style={styles.cameraTitle}>Kamera ile okut</Text>
            <Text style={styles.cameraSubtitle}>Etiketi çerçeve içine getirin</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>CANLI</Text></View>
        </View>

        {permission?.granted ? (
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarcode}
              onMountError={(event) => setCameraError(event.message)}
            />
            <View pointerEvents="none" style={styles.scanFrame}>
              <View style={styles.cornerTopLeft} /><View style={styles.cornerTopRight} />
              <View style={styles.cornerBottomLeft} /><View style={styles.cornerBottomRight} />
              <View style={styles.scanLine} />
            </View>
          </View>
        ) : (
          <View style={styles.permissionBox}>
            <View style={styles.cameraIcon}><Text style={styles.cameraIconText}>▣</Text></View>
            <Text style={styles.permissionTitle}>Kamera erişimi gerekli</Text>
            <Text style={styles.permissionText}>QR kodunu okumak için izin verin. İzin vermezseniz manuel girişi kullanabilirsiniz.</Text>
            <Button title="Kamera iznini iste" onPress={() => void requestPermission()} />
          </View>
        )}
        {cameraError ? <Text style={styles.cameraError}>{cameraError}</Text> : null}
        {Platform.OS === 'web' && !permission?.granted ? (
          <Text style={styles.webHint}>Web kamerası `localhost` üzerinde çalışır; güvenli olmayan ağlarda kullanılamayabilir.</Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Makine kodu ile gir" />
        <View style={styles.manualRow}>
          <TextInput
            accessibilityLabel="Makine kodu"
            testID="manual-machine-code"
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="MCH-2026-001"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.manualInput}
            onSubmitEditing={() => void openCode(manualCode)}
            returnKeyType="search"
          />
          <Button title="Bul" onPress={() => void openCode(manualCode)} loading={loading} compact />
        </View>
      </Card>

      <View>
        <SectionTitle title="Demo makine seçici" action={<Text style={styles.simulationHint}>Masaüstü testi</Text>} />
        <Text style={styles.simulationText}>Kamera olmadan akışı denemek için bir demo makine seçin.</Text>
        <View style={styles.simulationGrid}>
          {machines.map((machine) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${machine.code} makinesini aç`}
              key={machine.id}
              onPress={() => void openCode(machine.code)}
              style={({ pressed }) => [styles.simulationCard, pressed && styles.simulationCardPressed]}
            >
              <View style={styles.simulationTop}>
                <Text style={styles.simulationCode}>{machine.code}</Text>
                <StatusBadge status={machine.status} />
              </View>
              <Text style={styles.simulationName}>{machine.name}</Text>
              <Text style={styles.simulationLine}>{machine.line}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? <ErrorState message={error} onRetry={() => { setError(null); void loadMachines(); }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  header: { gap: 3 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted, maxWidth: 650 },
  cameraCard: { gap: spacing.lg },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cameraTitle: { ...typography.subheading, color: colors.ink },
  cameraSubtitle: { ...typography.caption, color: colors.inkMuted },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.successSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { ...typography.caption, color: colors.success, fontWeight: '900', letterSpacing: .7 },
  cameraFrame: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.ink },
  scanFrame: { position: 'absolute', width: 210, height: 210, top: 55, left: '50%', marginLeft: -105 },
  cornerTopLeft: { position: 'absolute', width: 34, height: 34, top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderColor: colors.primary, borderTopLeftRadius: 8 },
  cornerTopRight: { position: 'absolute', width: 34, height: 34, top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderColor: colors.primary, borderTopRightRadius: 8 },
  cornerBottomLeft: { position: 'absolute', width: 34, height: 34, bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: colors.primary, borderBottomLeftRadius: 8 },
  cornerBottomRight: { position: 'absolute', width: 34, height: 34, bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderColor: colors.primary, borderBottomRightRadius: 8 },
  scanLine: { position: 'absolute', left: 8, right: 8, top: '50%', height: 2, backgroundColor: colors.primary, opacity: .8 },
  permissionBox: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  cameraIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cameraIconText: { color: colors.primary, fontSize: 27, fontWeight: '900' },
  permissionTitle: { ...typography.subheading, color: colors.ink },
  permissionText: { ...typography.body, color: colors.inkMuted, textAlign: 'center', maxWidth: 430 },
  cameraError: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radius.sm },
  webHint: { ...typography.caption, color: colors.warning, textAlign: 'center' },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manualInput: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, color: colors.ink, paddingHorizontal: spacing.md, ...typography.body, letterSpacing: .4 },
  simulationHint: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  simulationText: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.sm, marginBottom: spacing.md },
  simulationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  simulationCard: { flexGrow: 1, flexBasis: '44%', minWidth: 250, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  simulationCardPressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  simulationTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  simulationCode: { ...typography.label, color: colors.primaryDark },
  simulationName: { ...typography.subheading, color: colors.ink },
  simulationLine: { ...typography.caption, color: colors.inkMuted },
});
