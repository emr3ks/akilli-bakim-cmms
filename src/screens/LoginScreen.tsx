import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../api';
import { MeknivoLogo } from '../brand/MeknivoLogo';
import { colors, radius, shadow, spacing, typography } from '../theme';
import type { Role, User } from '../types';
import { Button, ErrorState, LoadingState, roleLabels } from '../ui';

const roleDescriptions: Record<Role, string> = {
  admin: 'Arızaları inceleyin, iş emirlerini oluşturun ve teknisyenlere atayın.',
  technician: 'Size atanan iş emirlerini müdahale notu ve çözüm fotoğrafıyla kapatın.',
  operator: 'Makineyi görüntüleyin, QR ile fotoğraflı hızlı arıza bildirimi gönderin.',
};

export function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginId, setLoginId] = useState<number | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDemoUsers();
      setUsers(response.users);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Demo kullanıcıları alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const login = async (user: User) => {
    setLoginId(user.id);
    setError(null);
    try {
      const response = await api.login(user.id);
      onLogin(response.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Giriş yapılamadı.');
    } finally {
      setLoginId(null);
    }
  };

  return (
    <LinearGradient colors={['#081735', '#0646A8', '#087FE5']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoBox} accessible accessibilityLabel="Meknivo CMMS">
              <MeknivoLogo variant="primary-horizontal" width={230} height={54} />
            </View>
            <Text style={styles.eyebrow}>ENDÜSTRİYEL BAKIM YÖNETİMİ</Text>
            <Text style={styles.title}>Meknivo CMMS</Text>
            <Text style={styles.subtitle}>
              Makine envanterinizi, periyodik bakım planlarını ve saha arıza akışınızı tek yerden yönetin.
            </Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Hızlı Demo Giriş</Text>
                <Text style={styles.panelSubtitle}>Devam etmek için rolünüzü seçin</Text>
              </View>
              <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View>
            </View>

            {loading ? <LoadingState label="Demo hesapları hazırlanıyor…" /> : null}
            {!loading && error && users.length === 0 ? (
              <ErrorState message={error} onRetry={() => void loadUsers()} />
            ) : null}
            {!loading && users.map((user) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${roleLabels[user.role]} olarak giriş yap`}
                accessibilityState={{ disabled: loginId !== null }}
                testID={`demo-login-${user.role}`}
                key={user.id}
                disabled={loginId !== null}
                onPress={() => void login(user)}
                style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed, loginId !== null && styles.roleCardDisabled]}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{user.initials}</Text></View>
                <View style={styles.roleBody}>
                  <View style={styles.roleTitleRow}>
                    <Text style={styles.roleTitle}>{roleLabels[user.role]}</Text>
                    <Text style={styles.roleName}>{user.name}</Text>
                  </View>
                  <Text style={styles.roleDescription}>{roleDescriptions[user.role]}</Text>
                </View>
                <View style={styles.arrow}><Text style={styles.arrowText}>›</Text></View>
              </Pressable>
            ))}
            {!loading && error && users.length > 0 ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{error}</Text>
                <Button title="Tekrar dene" onPress={() => void loadUsers()} variant="ghost" compact />
              </View>
            ) : null}

            <View style={styles.securityNote}>
              <Text style={styles.securityIcon}>✓</Text>
              <Text style={styles.securityText}>Rol bazlı yetkililer API katmanında doğrulanır.</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.xl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  hero: { alignItems: 'center', gap: spacing.sm },
  logoBox: {
    width: 262,
    height: 82,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadow,
  },
  eyebrow: { ...typography.caption, color: '#BFD8FF', fontWeight: '800', letterSpacing: 1.5 },
  title: { ...typography.title, color: colors.white, textAlign: 'center', fontSize: 34, lineHeight: 39 },
  subtitle: { ...typography.body, color: '#D7E6FC', textAlign: 'center', maxWidth: 460 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { ...typography.heading, color: colors.ink },
  panelSubtitle: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
  demoPill: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  demoPillText: { ...typography.caption, color: colors.primaryDark, fontWeight: '900', letterSpacing: 1 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  roleCardPressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleCardDisabled: { opacity: 0.58 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, ...typography.label, fontSize: 14 },
  roleBody: { flex: 1, gap: 3 },
  roleTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  roleTitle: { ...typography.subheading, color: colors.ink },
  roleName: { ...typography.caption, color: colors.inkMuted },
  roleDescription: { ...typography.caption, color: colors.inkMuted },
  arrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: colors.primary, fontSize: 23, lineHeight: 25, fontWeight: '500' },
  inlineError: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  inlineErrorText: { ...typography.caption, color: colors.danger },
  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  securityIcon: { color: colors.success, fontWeight: '900' },
  securityText: { ...typography.caption, color: colors.inkMuted },
});
