const DAY_MS = 24 * 60 * 60 * 1000;
const BIWEEK_DAYS = 14;
const ANCHOR_DATE_UTC = Date.UTC(2024, 0, 1);

const toUTCDate = (dateInput) => {
  const date = new Date(dateInput);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addDays = (date, days) => {
  return new Date(date.getTime() + days * DAY_MS);
};

const getInclusiveDayCount = (fromDateInput, toDateInput) => {
  const fromDate = toUTCDate(fromDateInput);
  const toDate = toUTCDate(toDateInput);
  return Math.max(Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1, 1);
};

const formatDateOnly = (date) => {
  return date.toISOString().split('T')[0];
};

const normalizeHours = (hoursValue, fallback = 0) => {
  const parsed = Number(hoursValue);
  if (Number.isNaN(parsed) || parsed < 0) {
    return Number(fallback.toFixed(2));
  }

  return Number(parsed.toFixed(2));
};

const getBiWeeklyPeriodStart = (dateInput) => {
  const currentDate = toUTCDate(dateInput);
  const diffDays = Math.floor((currentDate.getTime() - ANCHOR_DATE_UTC) / DAY_MS);
  const periodOffset = Math.floor(diffDays / BIWEEK_DAYS) * BIWEEK_DAYS;
  return new Date(ANCHOR_DATE_UTC + periodOffset * DAY_MS);
};

const generateDefaultEntries = (periodStart, periodEnd = addDays(periodStart, BIWEEK_DAYS - 1)) => {
  const entryCount = getInclusiveDayCount(periodStart, periodEnd);

  return Array.from({ length: entryCount }, (_, index) => {
    const date = addDays(periodStart, index);
    const day = date.getUTCDay();
    const isWeekend = day === 0 || day === 6;

    return {
      date,
      entryType: isWeekend ? 'Off Day' : 'Regular Hours',
      notes: '',
      hours: isWeekend ? 0 : 7,
      overtimeHours: 0,
      dateOnly: formatDateOnly(date),
    };
  });
};

const buildPeriod = (dateInput) => {
  const periodStart = getBiWeeklyPeriodStart(dateInput);
  const periodEnd = addDays(periodStart, BIWEEK_DAYS - 1);
  return { periodStart, periodEnd };
};

const normalizeEntries = (entries = []) => {
  return entries.map((entry) => {
    const normalizedDate = toUTCDate(entry.date);
    const day = normalizedDate.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const defaultType = isWeekend ? 'Off Day' : 'Regular Hours';
    const normalizedType =
      typeof entry.entryType === 'string' && entry.entryType.trim()
        ? entry.entryType.trim()
        : defaultType;
    let defaultHours = 7;
    if (normalizedType === 'Off Day') {
      defaultHours = 0;
    }
    if (normalizedType === 'Half Day - Morning') {
      defaultHours = 4;
    }
    if (normalizedType === 'Half Day - Afternoon') {
      defaultHours = 3;
    }
    if (normalizedType === 'Half Day') {
      defaultHours = 3.5;
    }

    const hours = normalizeHours(entry.hours, defaultHours);
    const overtimeHours = normalizedType !== 'Overtime' ? 0 : normalizeHours(entry.overtimeHours, 0);

    return {
      date: normalizedDate,
      entryType: normalizedType,
      notes: entry.notes || '',
      hours,
      overtimeHours,
      dateOnly: formatDateOnly(normalizedDate),
    };
  });
};

const sumHours = (entries = []) => {
  return Number(
    entries
      .reduce((acc, curr) => acc + (curr.hours || 0) + (curr.overtimeHours || 0), 0)
      .toFixed(2)
  );
};

module.exports = {
  buildPeriod,
  generateDefaultEntries,
  normalizeEntries,
  sumHours,
  toUTCDate,
};
