const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;

  const year = Number(match[0].slice(0, 4));
  const month = Number(match[0].slice(5, 7));
  const day = Number(match[0].slice(8, 10));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
