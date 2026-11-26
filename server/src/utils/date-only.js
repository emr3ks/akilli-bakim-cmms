const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function isDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseDateOnly(value) {
  if (!isDateOnly(value)) throw new TypeError(`Invalid UTC date-only value: ${value}`);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function todayUtcDate(now = new Date()) {
  return formatDateOnly(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )));
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

export function dueStateForDate(nextDueDate, today = todayUtcDate()) {
  if (nextDueDate < today) return 'overdue';
  if (nextDueDate === today) return 'due';
  if (nextDueDate <= addUtcDays(today, 7)) return 'upcoming';
  return 'scheduled';
}
