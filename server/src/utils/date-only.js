const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const PLANT_TIME_ZONE = 'Europe/Istanbul';

export function isDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseDateOnly(value) {
  if (!isDateOnly(value)) throw new TypeError(`Invalid date-only value: ${value}`);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

/** Return the civil date at a plant in the configured IANA time zone. */
export function dateOnlyForInstant(value, timeZone = PLANT_TIME_ZONE) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TypeError(`Invalid instant: ${value}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function todayPlantDate(now = new Date()) {
  return dateOnlyForInstant(now);
}

export function addUtcDays(dateOnly, days) {
  const date = parseDateOnly(dateOnly);
  return formatDateOnly(new Date(date.getTime() + (days * MILLISECONDS_PER_DAY)));
}

export function addCalendarMonths(dateOnly, months) {
  const source = parseDateOnly(dateOnly);
  const sourceDay = source.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth() + months,
    1,
  ));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const targetLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatDateOnly(new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(sourceDay, targetLastDay),
  )));
}

export function addWorkingDays(dateOnly, workingDays) {
  if (!Number.isInteger(workingDays) || workingDays < 0) {
    throw new TypeError('workingDays must be a non-negative integer');
  }

  const date = parseDateOnly(dateOnly);
  let remaining = workingDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return formatDateOnly(date);
}

export function dueStateForDate(
  nextDueDate,
  {
    frequency = 'date',
    nextDueRuntimeHours = null,
    currentRuntimeHours = null,
    today = todayPlantDate(),
  } = {},
) {
  if (frequency === 'working_hours') {
    if (currentRuntimeHours === null || nextDueRuntimeHours === null) return 'scheduled';
    if (currentRuntimeHours > nextDueRuntimeHours) return 'overdue';
    if (currentRuntimeHours === nextDueRuntimeHours) return 'due';
    return 'upcoming';
  }

  if (nextDueDate < today) return 'overdue';
  if (nextDueDate === today) return 'due';
  if (nextDueDate <= addUtcDays(today, 7)) return 'upcoming';
  return 'scheduled';
}
