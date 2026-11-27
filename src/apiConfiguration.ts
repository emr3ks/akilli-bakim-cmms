const loopbackBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

export interface ApiConfigurationInput {
  platform: 'web' | 'native';
  configuredUrl?: string | null;
  hostUri?: string | null;
  port?: number | null;
}

export function resolveApiBaseUrl({
  platform,
  configuredUrl,
  hostUri,
  port,
}: ApiConfigurationInput): string {
  const configured = configuredUrl?.trim() || null;
  const host = hostUri?.trim() || null;
  const hostname = host
    ? host.replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0] || null
    : null;
  const apiPort = Number(port || 3006);
  const inferredNativeUrl = hostname && Number.isInteger(apiPort) && apiPort > 0
    ? `http://${hostname}:${apiPort}/api`
    : null;
  const effectiveConfiguredUrl = platform === 'web'
    ? configured
    : configured && !loopbackBaseUrl.test(configured)
      ? configured
      : null;

  return (
    effectiveConfiguredUrl
    || (platform === 'web' ? 'http://localhost:3006/api' : inferredNativeUrl)
    || ''
  ).replace(/\/$/, '');
}

export function apiConfigurationErrorMessage(baseUrl: string): string | null {
  if (baseUrl) return null;
  return 'API adresi belirlenemedi. Expo Go için .env.local dosyasına EXPO_PUBLIC_API_URL=http://<bilgisayar-lan-ip-adresi>:3006/api ekleyip Metro sunucusunu yeniden başlatın.';
}
