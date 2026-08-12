export function getWIBDateString(date: Date = new Date()): string {
  // Convert date to Asia/Jakarta (WIB = UTC+7)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // returns YYYY-MM-DD
  return formatter.format(date);
}

export function getWIBMonthRange(date: Date = new Date()): { startDate: string; endDate: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed

  // First day of current month in WIB
  const start = new Date(Date.UTC(year, month, 1));
  // Last day of current month in WIB
  const end = new Date(Date.UTC(year, month + 1, 0));

  return {
    startDate: getWIBDateString(start),
    endDate: getWIBDateString(end),
  };
}

export function getWIBWeekRange(date: Date = new Date()): { startDate: string; endDate: string } {
  const current = new Date(date);
  const start = new Date(current);
  start.setDate(current.getDate() - 6); // 7 days window

  return {
    startDate: getWIBDateString(start),
    endDate: getWIBDateString(current),
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}
