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
