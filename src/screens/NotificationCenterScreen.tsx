import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api } from '../api';
import { formatDateTime } from '../format';
import { colors, radius, spacing, typography } from '../theme';
import type { AppNotification, NotificationSeverity, User } from '../types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionTitle,
} from '../ui';

interface NotificationCenterScreenProps {
  user: User;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

const severityLabels: Record<NotificationSeverity, string> = {
  critical: 'KRİTİK',
  warning: 'UYARI',
  info: 'BİLGİ',
};

const typeLabels: Record<string, string> = {
  critical_fault: 'Kritik arıza',
  work_order_assignment: 'İş emri ataması',
  critical_stock: 'Kritik stok',
  sensor_threshold: 'Sensör eşiği',
};

function severityPalette(severity: NotificationSeverity) {
  if (severity === 'critical') return { background: colors.dangerSoft, color: colors.danger };
  if (severity === 'warning') return { background: colors.warningSoft, color: colors.warning };
  return { background: colors.primarySoft, color: colors.primaryDark };
}

export function NotificationCenterScreen({ user, onClose, onUnreadCountChange }: NotificationCenterScreenProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getNotifications(user.id);
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      onUnreadCountChange(result.unreadCount);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bildirimler alınamadı.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onUnreadCountChange, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    setError(null);
    try {
      const result = await api.markAllNotificationsRead(user.id);
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
      setUnreadCount(result.unreadCount);
      onUnreadCountChange(result.unreadCount);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bildirimler okundu işaretlenemedi.');
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={styles.container} testID="notification-center-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bildirim merkezini kapat"
            onPress={onClose}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>MERKEZİ BİLDİRİM</Text>
            <Text style={styles.title}>Bildirim Merkezi</Text>
            <Text style={styles.subtitle}>{unreadCount} okunmamış bildirim</Text>
          </View>
          <Button
            title="Tümünü Okundu İşaretle"
            onPress={() => void markAllRead()}
            loading={marking}
            disabled={unreadCount === 0}
            variant="secondary"
            compact
            testID="mark-all-notifications-read"
          />
        </View>

        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {loading && !notifications.length ? <LoadingState label="Bildirimler hazırlanıyor…" /> : null}
        {!loading && !error && !notifications.length ? (
          <Card>
            <EmptyState
              title="Bildirim yok"
              description="Kritik arıza, iş emri, stok ve sensör olayları burada görünecek."
            />
          </Card>
        ) : null}

        {notifications.length ? (
          <View style={styles.list}>
            <SectionTitle title="Bildirim akışı" action={<Text style={styles.count}>{notifications.length} kayıt</Text>} />
            {notifications.map((notification) => {
              const palette = severityPalette(notification.severity);
              return (
                <Card
                  key={notification.id}
                  style={[styles.notificationCard, !notification.isRead && styles.notificationUnread]}
                  testID={`notification-${notification.id}`}
                >
                  <View style={styles.notificationTop}>
                    <View style={[styles.severityBadge, { backgroundColor: palette.background }]}>
                      <Text style={[styles.severityText, { color: palette.color }]}>
                        {severityLabels[notification.severity]}
                      </Text>
                    </View>
                    {!notification.isRead ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.notificationType}>{typeLabels[notification.type] ?? 'Sistem bildirimi'}</Text>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationMessage}>{notification.message}</Text>
                  <Text style={styles.notificationDate}>{formatDateTime(notification.createdAt)}</Text>
                </Card>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.ink, fontSize: 32, lineHeight: 34, fontWeight: '300' },
  headerCopy: { flexGrow: 1, flexBasis: 240, gap: 2 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.body, color: colors.inkMuted },
  list: { gap: spacing.md },
  count: { ...typography.caption, color: colors.inkMuted },
  notificationCard: { gap: 5 },
  notificationUnread: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  notificationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  severityBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill },
  severityText: { ...typography.caption, fontWeight: '900' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  notificationType: { ...typography.caption, color: colors.primaryDark, fontWeight: '800' },
  notificationTitle: { ...typography.subheading, color: colors.ink },
  notificationMessage: { ...typography.body, color: colors.inkMuted },
  notificationDate: { ...typography.caption, color: colors.inkMuted },
});
