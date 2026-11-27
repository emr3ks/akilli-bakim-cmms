import { formatDateTime, formatNumber } from './format';
import { colors } from './theme';
import type { SparePartCategory, SparePartStatus, SparePartUnit } from './types';

export const sparePartCategoryLabels: Record<SparePartCategory, string> = {
  bearing: 'Rulman',
  belt_sprocket: 'Kayış / Kasnak',
  sensor_automation: 'Sensör / Otomasyon',
  hydraulic_pneumatic: 'Hidrolik / Pnömatik',
  electrical: 'Elektrik',
  consumable: 'Sarf Malzeme',
};

export const sparePartUnitLabels: Record<SparePartUnit, string> = {
  piece: 'Adet',
  meter: 'Metre',
  liter: 'Litre',
  set: 'Set',
};

export const sparePartStatusLabels: Record<SparePartStatus, string> = {
  sufficient: 'Yeterli',
  critical: 'Kritik Seviye',
  depleted: 'Tükendi',
};

export function sparePartStatusPalette(status: SparePartStatus) {
  if (status === 'depleted') return { background: colors.dangerSoft, color: colors.danger };
  if (status === 'critical') return { background: colors.warningSoft, color: colors.warning };
  return { background: colors.successSoft, color: colors.success };
}

export function formatQuantity(value: number): string {
  return formatNumber(value, 3);
}

export function formatCurrency(value: number): string {
  return `${formatNumber(value, 2)} ₺`;
}

export function formatMovementDate(value: string): string {
  return formatDateTime(value);
}
