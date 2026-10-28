/** Gregorian Easter (Meeus/Jones/Butcher Computus), expressed as a local calendar date. */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(year, Math.floor(n / 31) - 1, n % 31 + 1, 12);
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function holidayFor(date = new Date()) {
  const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
  if (!Number.isFinite(year)) return null;
  if (month === 10 && day >= 24 && day <= 31) return 'halloween';
  if (month === 12 && day >= 24 && day <= 26) return 'christmas';
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'new-year';
  if (month === 2 && day === 14) return 'valentine';
  // Calendar arithmetic, never elapsed 24-hour periods (DST can make those 23/25 hours).
  const easter = easterSunday(year);
  for (let offset = -2; offset <= 1; offset++) {
    const holiday = new Date(year, easter.getMonth(), easter.getDate() + offset, 12);
    if (holiday.getMonth() + 1 === month && holiday.getDate() === day) return 'easter';
  }
  const june19 = new Date(year, 5, 19, 12);
  const friday = 19 + (5 - june19.getDay() + 7) % 7;
  if (month === 6 && day >= friday && day <= friday + 2) return 'midsummer';
  return null;
}
