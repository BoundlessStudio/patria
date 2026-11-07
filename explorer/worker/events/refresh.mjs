import { fetchOccurrences } from './adapters.mjs';
import { publicUrl, plain, PublisherIssue } from './publishers.mjs';
import { claimPublisher, fold, listDue, recordId, recordPublisherIssue, recordPublisherResults } from './store.mjs';
import { dayMs, normalizeSchedule } from './time.mjs';
import { resolveVenue } from './venues.mjs';

function clockZone(value, venueZone) {
  if (!value) return venueZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: value }); return value; }
  catch { return venueZone; }
}

async function identify(row, venue, title, schedule, externalId, url, status) {
  const seriesId = await recordId('series', venue.id, fold(title));
  const id = await recordId(seriesId, schedule.kind === 'timed' ? schedule.startAt : schedule.startDate);
  return { id, seriesId, venue, title, ...schedule, externalId, url, bookingUrl: publicUrl(row.bookingUrl, url), status };
}

export async function verifyOccurrences(raw, source, options) {
  const { now, env } = options;
  const geocodeBudget = { left: env.PATRIA_LOCAL === 'true' ? 5 : 2 };
  const venues = new Map();
  const results = new Map();
  const holds = [];
  let geocodeFailure;
  for (const row of raw) {
    if (options.signal?.aborted) throw options.signal.reason;
    const externalId = ['number', 'string'].includes(typeof row.externalId) ? String(row.externalId).slice(0, 500) : '';
    if (!externalId) continue;
    const url = publicUrl(row.url, source.url);
    const title = plain(row.title).slice(0, 250);
    const unavailable = /\b(?:sold out|private event|closed to (?:the )?public|call for submissions|call for artists|complet|annule)\b/i.test(fold(title));
    const status = ['cancelled', 'superseded'].includes(row.status) ? row.status : unavailable ? 'superseded' : 'active';
    if (status === 'active' && /^\d{4}-\d{2}-\d{2}/.test(row.start ?? '')) {
      const startDay = Date.parse(row.start.slice(0, 10));
      const endDay = Date.parse((row.end ?? row.start).slice(0, 10));
      if (startDay > now + 46 * dayMs || endDay < now - 2 * dayMs) continue;
    }
    let venue;
    const key = JSON.stringify(row.venue ?? null);
    if (row.venue && row.start && title && url) {
      if (!venues.has(key)) {
        try { venues.set(key, await resolveVenue({ ...row.venue, url: row.venue.url || url }, source, { ...options, geocodeBudget })); }
        catch (error) { geocodeFailure = error; venues.set(key, null); }
      }
      venue = venues.get(key);
    }
    const timezone = venue && clockZone(row.timezone, venue.timezone);
    const schedule = venue && normalizeSchedule(row, timezone);
    if (!schedule || !title || !url) {
      if (status !== 'active') results.set(externalId, { externalId, url, status });
      else holds.push({ externalId, url, title, reason: !venue ? 'unresolved_venue' : !schedule ? 'unresolved_schedule' : 'missing_listing' });
      continue;
    }
    if (schedule.endAt < now - dayMs || schedule.startAt > now + 46 * dayMs) continue;
    const verified = await identify(row, venue, title, schedule, externalId, url, status);
    if (!results.has(externalId) || status !== 'active') results.set(externalId, verified);
    if (row.previousStart && row.previousStart !== row.start) {
      const previous = normalizeSchedule({ start: row.previousStart }, timezone);
      if (previous) {
        const priorId = `${externalId}:previous:${row.previousStart}`;
        results.set(priorId, await identify(row, venue, title, previous, priorId, url, 'superseded'));
      }
    }
  }
  if (geocodeFailure && ![...results.values()].some(row => row.status === 'active')) throw geocodeFailure;
  return { rows: [...results.values()], holds };
}

export async function refreshPublisher(db, id, { env = {}, fetcher = fetch, signal, now = Date.now(), force = false } = {}) {
  const source = await claimPublisher(db, id, now, force);
  if (!source) return { id, skipped: true };
  try {
    const data = await fetchOccurrences(source, { fetcher, signal, now });
    const { rows, holds } = await verifyOccurrences(data.rows, source, { db, env, fetcher, signal, now });
    const verified = await recordPublisherResults(db, source, rows, { now, complete: data.complete, holds });
    return { id, verified, held: holds.length };
  } catch (error) {
    const status = error instanceof PublisherIssue ? error.status : 'failing';
    const message = error instanceof PublisherIssue || /^(?:Publisher|Calendar|Venue lookup)/.test(error.message)
      ? error.message : signal?.aborted ? 'The refresh ran out of time.' : 'Could not read the publisher endpoint.';
    await recordPublisherIssue(db, source, status, message, now);
    return { id, status, error: message };
  }
}

export async function refreshDue(db, { limit = 4, concurrent = false, ...options } = {}) {
  const due = await listDue(db, { limit, ...options });
  if (concurrent) return Promise.all(due.map(({ id }) => refreshPublisher(db, id, options)));
  const results = [];
  for (const { id } of due) {
    if (options.signal?.aborted) break;
    results.push(await refreshPublisher(db, id, options));
  }
  return results;
}
