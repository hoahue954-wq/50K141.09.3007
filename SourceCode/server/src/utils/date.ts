const HCMC_OFFSET = '+07:00';

export function getHcmDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getHcmDateRange(dateString: string): { start: Date; end: Date } {
  const start = new Date(`${dateString}T00:00:00${HCMC_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function getHcmWeekRange(date: Date): { start: Date; end: Date } {
  const today = getHcmDateString(date);
  const { start: todayStart } = getHcmDateRange(today);
  const weekday = new Date(`${today}T12:00:00${HCMC_OFFSET}`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const start = new Date(todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return { start, end: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) };
}
