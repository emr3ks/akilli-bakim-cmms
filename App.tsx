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

import { api } from './src/api';
import { colors, radius, spacing, typography } from './src/theme';
import { MeknivoLogo } from './src/brand/MeknivoLogo';
import type { Machine, User } from './src/types';
import { roleLabels } from './src/ui';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MachineDetailScreen } from './src/screens/MachineDetailScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import { PreventiveScreen } from './src/screens/PreventiveScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { ShiftHandoverScreen } from './src/screens/ShiftHandoverScreen';
import { SparePartsScreen } from './src/screens/SparePartsScreen';
import { WorkOrdersScreen } from './src/screens/WorkOrdersScreen';

const SESSION_KEY = 'cmms.session.v1';
type Tab = 'dashboard' | 'inventory' | 'spares' | 'preventive' | 'workorders' | 'handover' | 'scanner' | 'analytics';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Özet', icon: '◫' },
  { key: 'inventory', label: 'Envanter', icon: '▦' },
  { key: 'spares', label: 'Parçalar', icon: '⬢' },
  { key: 'preventive', label: 'Bakım', icon: '↻' },
  { key: 'workorders', label: 'Arıza / İş', icon: '⚑' },
  { key: 'handover', label: 'Devir', icon: '⇄' },
  { key: 'scanner', label: 'QR Okut', icon: '⌗' },
  { key: 'analytics', label: 'Analitik', icon: '↗' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationCenterVisible, setNotificationCenterVisible] = useState(false);

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

  const handleUnreadCountChange = useCallback((count: number) => {
    setNotificationCount(Math.max(0, count));
  }, []);

  useEffect(() => {
    if (!user) {
      setNotificationCount(0);
      return;
    }
    const loadNotificationCount = async () => {
      try {
        const result = await api.getNotifications(user.id);
        setNotificationCount(result.unreadCount);
      } catch {
        // A transient notification-count failure must not block the CMMS shell.
      }
    };
    void loadNotificationCount();
    const timer = setInterval(() => void loadNotificationCount(), 30_000);
    return () => clearInterval(timer);
  }, [user]);

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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bildirim merkezi"
                testID="notification-bell"
                onPress={() => {
                  setSelectedMachine(null);
                  setNotificationCenterVisible(true);
                }}
                style={styles.notificationButton}
              >
                <Text style={styles.notificationIcon}>🔔</Text>
                {notificationCount > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
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
            {notificationCenterVisible ? (
              <NotificationCenterScreen
                user={user}
                onClose={() => setNotificationCenterVisible(false)}
                onUnreadCountChange={handleUnreadCountChange}
              />
            ) : selectedMachine ? (
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
                onOpenSpareParts={() => setTab('spares')}
                onOpenScanner={() => setTab('scanner')}
                onOpenWorkOrders={() => setTab('workorders')}
                onOpenPreventive={() => setTab('preventive')}
              />
            ) : tab === 'analytics' && user.role === 'admin' ? (
              <AnalyticsScreen user={user} />
            ) : tab === 'inventory' ? (
              <InventoryScreen user={user} onOpenMachine={setSelectedMachine} />
            ) : tab === 'spares' ? (
              <SparePartsScreen user={user} />
            ) : tab === 'preventive' ? (
              <PreventiveScreen user={user} />
            ) : tab === 'workorders' ? (
              <WorkOrdersScreen user={user} />
            ) : tab === 'handover' ? (
              <ShiftHandoverScreen user={user} />
            ) : (
              <ScannerScreen user={user} onOpenMachine={setSelectedMachine} />
            )}
          </View>

          {!selectedMachine && !notificationCenterVisible ? (
            <View style={styles.bottomNav}>
              <View style={styles.navInner}>
                {tabs.filter((item) => (
                  (user.role === 'admin' || item.key !== 'analytics')
                  && (user.role !== 'operator' || !['workorders', 'preventive', 'spares', 'analytics'].includes(item.key))
                )).map((item) => {
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
  notificationButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationIcon: { fontSize: 18, lineHeight: 22 },
  notificationBadge: { position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { color: colors.white, fontSize: 9, lineHeight: 12, fontWeight: '900' },
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
