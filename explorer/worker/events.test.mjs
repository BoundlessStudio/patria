import test from 'node:test';
import assert from 'node:assert/strict';
import { openLocalEvents } from '../scripts/local-events.mjs';
import { handleApi } from './api.mjs';
import { parseCalendar } from './events/adapters.mjs';
import { dateWindow, normalizeSchedule } from './events/time.mjs';
import { claimPublisher, listDue, readNearby, recordPublisherIssue, recordPublisherResults, seedPublishers, sourceReport } from './events/store.mjs';
import { publisherRecord } from './events/registry.mjs';
import { verifyOccurrences } from './events/refresh.mjs';

const now = Date.parse('2026-11-06T17:00:00Z');
const location = { name: 'Public library', address: '10 Main Street', city: 'Toronto', region: 'ON', lat: 43.65, lng: -79.4 };
const source = (id = 'library', authority = 2) => publisherRecord({
  id, publisher: id, url: `https://${id}.example.org/events`, region: 'ON', coverage: 'Toronto',
  category: 'library', authority, ingest: { adapter: 'ical', access: 'public-feed' },
}, 'additional');

function database(t) {
  const db = openLocalEvents(':memory:');
  t.after(() => db.close());
  return db;
}

async function save(db, publisher, raw, time = now) {
  const claim = await claimPublisher(db, publisher.id, time, true);
  const { rows, holds } = await verifyOccurrences(raw, claim, { db, env: { PATRIA_EVENTS_GEOCODE: 'off' }, now: time });
  await recordPublisherResults(db, claim, rows, { now: time, holds });
}

const session = (publisher, fields = {}) => ({
  title: 'Saturday workshop', externalId: 'event-1', start: '2026-11-07T13:00:00-05:00',
  url: `${publisher.url}/event-1`, venue: location, status: 'active', ...fields,
});
const area = { lat: location.lat, lng: location.lng, radius: 1200, window: '7d' };

test('Canadian explorer search applies the Photon country filter and municipality label', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ features: [{
    geometry: { type: 'Point', coordinates: [-81.24, 42.98] },
    properties: { name: 'London', city: 'London', state: 'Ontario', countrycode: 'CA', country: 'Canada' },
  }] }));
  const request = new Request('https://patria.test/api/search?q=London&country=CA', { headers: {
    'oai-authenticated-user-id': 'verified', 'oai-authenticated-user-email': 'test@example.org',
  } });
  const response = await handleApi(request);
  assert.equal(mock.mock.calls[0].arguments[0].searchParams.get('countrycode'), 'CA');
  assert.match((await response.json()).locations[0].address, /London, Ontario/);
});

test('nearby API requires identity and rejects unsupported radius and date filters', async t => {
  const db = database(t);
  const url = 'https://patria.test/api/events/nearby?lat=43.65&lng=-79.4';
  assert.equal((await handleApi(new Request(url), { EVENTS_DB: db })).status, 401);
  const headers = { 'oai-authenticated-user-id': 'verified', 'oai-authenticated-user-email': 'test@example.org' };
  for (const suffix of ['&radius=1201', '&window=year']) {
    assert.equal((await handleApi(new Request(url + suffix, { headers }), { EVENTS_DB: db })).status, 400);
  }
  const response = await handleApi(new Request(url, { headers }), { EVENTS_DB: db });
  assert.deepEqual((await response.json()).events, []);
});

test('the server includes the 1,200 m boundary and excludes a farther event before rounding', async t => {
  const db = database(t);
  const publisher = source();
  await seedPublishers(db, [publisher]);
  const atDistance = meters => location.lat + meters / 6_371_000 * 180 / Math.PI;
  await save(db, publisher, [
    session(publisher, { title: 'Inside', venue: { ...location, address: '11 Main Street', lat: atDistance(1200 - 1e-7) } }),
    session(publisher, { externalId: 'event-2', title: 'Outside', venue: { ...location, address: '12 Main Street', lat: atDistance(1200.01) } }),
  ]);
  assert.deepEqual((await readNearby(db, area, now)).events.map(event => event.title), ['Inside']);
  assert.equal((await readNearby(db, { ...area, radius: 2500 }, now)).events.length, 2);
});

test('calendar days use the venue zone, including date-only runs and daylight saving changes', () => {
  const zone = 'America/Toronto';
  const window = dateWindow(Date.parse('2026-03-08T05:30:00Z'), zone, 'today');
  assert.equal(window.end - window.start, 23 * 3_600_000);
  const beforeMidnight = dateWindow(Date.parse('2026-11-07T04:30:00Z'), 'America/Whitehorse', 'today');
  assert.equal(new Date(beforeMidnight.start).toISOString(), '2026-11-06T07:00:00.000Z');
  const run = normalizeSchedule({ start: '2026-11-07', end: '2026-11-09', endExclusive: true }, zone);
  assert.equal(run.kind, 'run');
  assert.equal(run.endDate, '2026-11-08');
  assert.equal(normalizeSchedule({ start: '2026-03-08T02:30:00' }, zone), null);
  assert.equal(new Date(dateWindow(now, zone, 'weekend').start).toISOString(), '2026-11-07T05:00:00.000Z');
});

test('iCalendar expands occurrences, exclusions and reschedules with stable session IDs', () => {
  const publisher = source();
  const data = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:club', 'DTSTAMP:20261101T120000Z',
    'DTSTART:20261107T180000Z', 'DTEND:20261107T190000Z', 'RRULE:FREQ=DAILY;COUNT=4',
    'EXDATE:20261108T180000Z', 'SUMMARY:Club', 'LOCATION:Public Library', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:club', 'RECURRENCE-ID:20261109T180000Z', 'DTSTAMP:20261105T120000Z',
    'DTSTART:20261109T190000Z', 'DTEND:20261109T200000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:club', 'RECURRENCE-ID:20261110T180000Z', 'DTSTAMP:20261105T120000Z',
    'STATUS:CANCELLED', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const rows = parseCalendar(data, publisher, publisher.url, now);
  const active = rows.filter(row => row.status === 'active');
  assert.equal(active.length, 2);
  assert.equal(active[1].start, '2026-11-09T19:00:00.000Z');
  assert.equal(active[1].externalId, 'club#2026-11-09T18:00:00Z');
  assert.equal(rows.filter(row => row.status === 'cancelled').length, 2);
});

test('cross-publisher duplicates keep both links and follow authoritative reschedules and cancellations', async t => {
  const db = database(t);
  const direct = source('direct'), aggregator = source('aggregator', 1);
  await seedPublishers(db, [direct, aggregator]);
  await save(db, direct, [session(direct)]);
  await save(db, aggregator, [session(aggregator)]);
  const first = (await readNearby(db, area, now)).events[0];
  assert.equal(first.sessions.length, 1);
  assert.equal(first.sessions[0].sources.length, 2);
  await save(db, direct, [session(direct, { start: '2026-11-08T13:00:00-05:00' })], now + 1);
  const moved = (await readNearby(db, area, now)).events[0];
  assert.deepEqual(moved.sessions.map(item => item.start), ['2026-11-08T18:00:00.000Z']);
  await save(db, direct, [{ externalId: 'event-1', status: 'cancelled', url: direct.url }], now + 2);
  assert.equal((await readNearby(db, area, now)).events.length, 0);
});

test('a failed refresh serves fresh verified events as partial and qualification requires a repeat', async t => {
  const db = database(t);
  const publisher = source();
  await seedPublishers(db, [publisher]);
  await save(db, publisher, [session(publisher)]);
  assert.equal((await sourceReport(db)).qualifiedAdditions, 0);
  assert.deepEqual((await listDue(db, { now, qualification: true })).map(row => row.id), [publisher.id]);
  await save(db, publisher, [session(publisher)], now + 1);
  assert.equal((await sourceReport(db)).qualifiedAdditions, 1);
  assert.equal((await listDue(db, { now, qualification: true })).length, 0);
  const claim = await claimPublisher(db, publisher.id, now + 2, true);
  await recordPublisherIssue(db, claim, 'failing', 'Publisher returned HTTP 503.', now + 2);
  const results = await readNearby(db, area, now);
  assert.equal(results.partial, true);
  assert.equal(results.events.length, 1);
});

test('the hosted source report requires the configured operator identity or server token', async t => {
  const db = database(t);
  const env = { EVENTS_DB: db, PATRIA_EVENTS_OPERATOR_ID: 'owner', PATRIA_EVENTS_OPERATOR_TOKEN: 'test-service-token' };
  const invoke = headers => handleApi(new Request('https://patria.test/api/events/maintenance', {
    method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'event_source_report', arguments: { summary: true } } }),
  }), env).then(response => response.json());
  assert.equal((await invoke({ 'oai-authenticated-user-id': 'visitor', 'oai-authenticated-user-email': 'guest@example.org' })).error.code, -32001);
  assert.equal((await invoke({ 'X-Patria-Events-Token': 'wrong-token' })).error.code, -32001);
  assert.equal((await invoke({ 'X-Patria-Events-Token': 'test-service-token' })).result.structuredContent.total, 0);
});
