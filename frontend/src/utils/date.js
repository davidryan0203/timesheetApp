const toDateKey = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    const datePart = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKeyAsUTC = (value) => {
  const key = toDateKey(value);
  if (!key) {
    return null;
  }

  return new Date(`${key}T00:00:00.000Z`);
};

export const toISODate = (value = new Date()) => {
  return toDateKey(value);
};

export const formatDateLabel = (value) => {
  const utcDate = parseDateKeyAsUTC(value);
  if (!utcDate) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate);
};

export const formatDayLabel = (value) => {
  const utcDate = parseDateKeyAsUTC(value);
  if (!utcDate) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(utcDate);
};

export const formatRange = (start, end) => {
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
};
