import dayjs from 'dayjs';

export const toISODate = (date) => dayjs(date).format('YYYY-MM-DD');

export const formatFriendlyDate = (date) => dayjs(date).format('ddd, MMM D, YYYY');

export const formatRange = (start, end) => {
  return `${dayjs(start).format('MMM D, YYYY')} - ${dayjs(end).format('MMM D, YYYY')}`;
};
