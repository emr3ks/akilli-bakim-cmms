import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from './src/theme';
import { MeknivoLogo } from './src/brand/MeknivoLogo';
import type { Machine, User } from './src/types';
import { roleLabels } from './src/ui';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MachineDetailScreen } from './src/screens/MachineDetailScreen';
import { PreventiveScreen } from './src/screens/PreventiveScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { WorkOrdersScreen } from './src/screens/WorkOrdersScreen';

const SESSION_KEY = 'cmms.session.v1';
type Tab = 'dashboard' | 'inventory' | 'preventive' | 'workorders' | 'scanner';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Özet', icon: '◫' },
  { key: 'inventory', label: 'Envanter', icon: '▦' },
  { key: 'preventive', label: 'Bakım', icon: '↻' },
  { key: 'workorders', label: 'Arıza / İş', icon: '⚑' },
  { key: 'scanner', label: 'QR Okut', icon: '⌗' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as User;
          if (parsed.id && parsed.role) setUser(parsed);
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
      } finally {
        setBooting(false);
      }
    };
    void restoreSession();
  }, []);

  const handleLogin = async (nextUser: User) => {
    setUser(nextUser);
    setTab('dashboard');
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextUser)).catch(() => undefined);
  };

  const handleLogout = async () => {
    setUser(null);
    setSelectedMachine(null);
    setTab('dashboard');
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  };

  const handleMachineChanged = useCallback((machine: Machine) => {
    setSelectedMachine(machine);
  }, []);

  const handleMachineDeleted = useCallback((machineId: number) => {
    setSelectedMachine((current) => current?.id === machineId ? null : current);
  }, []);

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={styles.bootScreen} accessible accessibilityLabel="Meknivo CMMS yükleniyor">
          <View style={styles.bootLogo}>
            <MeknivoLogo variant="app-icon" width={72} height={72} />
          </View>
          <Text style={styles.bootTitle}>Meknivo CMMS</Text>
          <Text style={styles.bootText}>Uygulama hazırlanıyor…</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LoginScreen onLogin={(nextUser) => void handleLogin(nextUser)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.appFrame}>
          <View style={styles.header}>
            <View style={styles.brandRow} accessible accessibilityLabel="Meknivo CMMS">
              <MeknivoLogo variant="symbol" width={38} height={21} />
              <Text style={styles.brandName}>Meknivo CMMS</Text>
            </View>
            <View style={styles.profileRow}>
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{user.name}</Text>
                <Text style={styles.profileRole}>{roleLabels[user.role]}</Text>
              </View>
              <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user.initials}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Çıkış yap" onPress={() => void handleLogout()} style={styles.logoutButton}>
                <Text style={styles.logoutText}>↗</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.content}>
            {selectedMachine ? (
              <MachineDetailScreen
                machine={selectedMachine}
                user={user}
                onClose={() => setSelectedMachine(null)}
                onChanged={handleMachineChanged}
                onDeleted={handleMachineDeleted}
              />
            ) : tab === 'dashboard' ? (
              <DashboardScreen
                user={user}
                onOpenMachine={setSelectedMachine}
                onOpenInventory={() => setTab('inventory')}
                onOpenScanner={() => setTab('scanner')}
                onOpenWorkOrders={() => setTab('workorders')}
                onOpenPreventive={() => setTab('preventive')}
              />
            ) : tab === 'inventory' ? (
              <InventoryScreen user={user} onOpenMachine={setSelectedMachine} />
            ) : tab === 'preventive' ? (
              <PreventiveScreen user={user} />
            ) : tab === 'workorders' ? (
              <WorkOrdersScreen user={user} />
            ) : (
              <ScannerScreen user={user} onOpenMachine={setSelectedMachine} />
            )}
          </View>

          {!selectedMachine ? (
            <View style={styles.bottomNav}>
              <View style={styles.navInner}>
                {tabs.filter((item) => user.role !== 'operator' || !['workorders', 'preventive'].includes(item.key)).map((item) => {
                  const active = tab === item.key;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={item.label}
                      testID={`tab-${item.key}`}
                      key={item.key}
                      onPress={() => setTab(item.key)}
                      style={[styles.navItem, active && styles.navItemActive]}
                    >
                      <Text style={[styles.navIcon, active && styles.navIconActive]}>{item.icon}</Text>
                      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  appFrame: { flex: 1, backgroundColor: colors.background },
  bootScreen: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bootLogo: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  bootTitle: { ...typography.heading, color: colors.white, marginTop: spacing.sm },
  bootText: { ...typography.body, color: '#BFD0E4' },
  header: {
    minHeight: 70,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  brandName: { ...typography.label, color: colors.primaryDark, fontSize: 13, letterSpacing: 0.4 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  profileText: { alignItems: 'flex-end' },
  profileName: { ...typography.label, color: colors.ink },
  profileRole: { ...typography.caption, color: colors.inkMuted, fontSize: 10 },
  profileAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: colors.white, ...typography.caption, fontWeight: '800' },
  logoutButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: colors.inkMuted, fontSize: 16, fontWeight: '800' },
  content: { flex: 1 },
  bottomNav: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  navInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  navItem: { flex: 1, minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, paddingHorizontal: 2 },
  navItemActive: { backgroundColor: colors.primarySoft },
  navIcon: { color: colors.inkMuted, fontSize: 18, fontWeight: '700' },
  navIconActive: { color: colors.primary },
  navLabel: { ...typography.caption, color: colors.inkMuted, fontSize: 10, textAlign: 'center' },
  navLabelActive: { color: colors.primaryDark },
});
