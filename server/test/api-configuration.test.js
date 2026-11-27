import { describe, expect, it } from 'vitest';

import {
  apiConfigurationErrorMessage,
  resolveApiBaseUrl,
} from '../../src/apiConfiguration.ts';

describe('Expo API address resolution', () => {
  it('keeps localhost as the web default', () => {
    expect(resolveApiBaseUrl({ platform: 'web' })).toBe('http://localhost:3006/api');
  });

  it('uses an explicitly configured LAN address on a physical device', () => {
    expect(resolveApiBaseUrl({
      platform: 'native',
      configuredUrl: 'http://192.168.1.25:3006/api',
      hostUri: '192.168.1.10:8081',
    })).toBe('http://192.168.1.25:3006/api');
  });

  it('replaces a copied localhost setting with the Expo development host on native', () => {
    expect(resolveApiBaseUrl({
      platform: 'native',
      configuredUrl: 'http://localhost:3006/api',
      hostUri: '192.168.1.10:8081',
      port: 3006,
    })).toBe('http://192.168.1.10:3006/api');
  });

  it('returns an actionable configuration error when native discovery is impossible', () => {
    const baseUrl = resolveApiBaseUrl({ platform: 'native' });

    expect(baseUrl).toBe('');
    expect(apiConfigurationErrorMessage(baseUrl)).toContain('EXPO_PUBLIC_API_URL');
    expect(apiConfigurationErrorMessage('http://192.168.1.10:3006/api')).toBeNull();
  });
});
