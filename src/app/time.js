/** Format epoch instants only: never reinterpret local wall times or apply a fixed offset. */
export function createTimeFormatter(timeZone, locale = undefined) {
  let zone = timeZone || 'UTC';
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }); }
  catch { zone = 'UTC'; }
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: zone, timeZoneName: 'shortOffset',
  });
  return { zone, format: ms => formatter.format(ms) };
}

/** "Today 14:00" / "Tomorrow 14:00" (else "Mon 14:00") by the calendar date in `timeZone`. */
export function previewLabel(ms, now, timeZone, locale = undefined) {
  const { zone } = createTimeFormatter(timeZone, locale);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayNumber = t => Date.parse(`${day.format(t)}T00:00Z`) / 86400000;
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(ms);
  const offset = dayNumber(ms) - dayNumber(now);
  const name = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow'
    : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: zone }).format(ms);
  return `${name} ${clock}`;
}
