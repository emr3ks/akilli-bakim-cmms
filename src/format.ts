const PLANT_TIMEZONE_OFFSET_MINUTES = 180;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const parsed = new Date(Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      12,
    ));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function plantParts(value: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const shifted = new Date(parsed.getTime() + PLANT_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function formatDate(value: string): string {
  const parts = plantParts(value);
  if (!parts) return value || '—';
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year}`;
}

export function formatDateTime(value: string): string {
  const parts = plantParts(value);
  if (!parts) return value || '—';
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round((value + Number.EPSILON) * 10 ** maximumFractionDigits)
    / 10 ** maximumFractionDigits;
  const fixed = rounded.toFixed(maximumFractionDigits);
  const [integerPart = '0', decimalPart] = fixed.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimalPart ? `${groupedInteger},${decimalPart}` : groupedInteger;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return '—';
  const totalMinutes = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (!hours) return `${remainingMinutes} dk`;
  if (!remainingMinutes) return `${hours} sa`;
  return `${hours} sa ${remainingMinutes} dk`;
}

export function formatPlantDate(date = new Date(), daysToAdd = 0): string {
  const shifted = new Date(date.getTime() + PLANT_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const target = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + daysToAdd,
    12,
  ));
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

export function plantDateOnly(date = new Date()): string {
  return formatPlantDate(date);
}
