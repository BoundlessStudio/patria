import { Temporal } from '@js-temporal/polyfill';

export const dayMs = 86_400_000;
export const dateWindows = ['today', 'weekend', '7d', '14d', '30d'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function localDate(now, timezone) {
  return Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timezone).toPlainDate();
}

export function dateWindow(now, timezone, preset) {
  const today = localDate(now, timezone);
  const start = preset === 'weekend' && today.dayOfWeek < 6
    ? today.add({ days: 6 - today.dayOfWeek })
    : today;
  const days = preset === 'weekend' ? (start.dayOfWeek === 7 ? 1 : 2)
    : preset === 'today' ? 1 : Number.parseInt(preset, 10);
  return {
    start: start.toZonedDateTime(timezone).epochMilliseconds,
    end: start.add({ days }).toZonedDateTime(timezone).epochMilliseconds,
  };
}

function timestamp(value, timezone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return null;
  const iso = value.replace(' ', 'T');
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) return Temporal.Instant.from(iso).epochMilliseconds;
  return Temporal.PlainDateTime.from(iso).toZonedDateTime(timezone, { disambiguation: 'reject' }).epochMilliseconds;
}

export function normalizeSchedule({ start, end, endExclusive }, timezone) {
  try {
    if (datePattern.test(start)) {
      const first = Temporal.PlainDate.from(start);
      let last = first.add({ days: 1 });
      if (datePattern.test(end)) {
        last = Temporal.PlainDate.from(end).add({ days: endExclusive ? 0 : 1 });
        if (Temporal.PlainDate.compare(last, first) <= 0) return null;
      } else if (end) return null;
      const lastDay = last.subtract({ days: 1 }).toString();
      return {
        kind: lastDay === start ? 'date' : 'run',
        startAt: first.toZonedDateTime(timezone).epochMilliseconds,
        endAt: last.toZonedDateTime(timezone).epochMilliseconds,
        startDate: start, endDate: lastDay, hasEnd: true,
      };
    }
    const startAt = timestamp(start, timezone);
    const endAt = end ? timestamp(end, timezone) : null;
    if (startAt === null || (end && (endAt === null || endAt < startAt))) return null;
    return {
      kind: 'timed', startAt, endAt: endAt > startAt ? endAt : startAt + 1,
      startDate: localDate(startAt, timezone).toString(), endDate: null, hasEnd: endAt > startAt,
    };
  } catch {
    return null;
  }
}
