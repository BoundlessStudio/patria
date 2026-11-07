import { dayMs, dateWindow } from './time.mjs';

export const hourMs = 3_600_000;
const freshFor = 3 * dayMs;
const lockFor = 5 * 60_000;
const radiusPresets = [1200, 2500, 5000];
const claimable = "status IN ('queued', 'fetching', 'failing')";
const hasLease = 'EXISTS (SELECT 1 FROM event_publishers WHERE id = ? AND lease = ?)';

export const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const all = async (db, sql, ...args) => (await query(db, sql, ...args).all()).results;
export const first = (db, sql, ...args) => query(db, sql, ...args).first();
export const run = (db, sql, ...args) => query(db, sql, ...args).run();

export function fold(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export async function recordId(...fields) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fields)));
  return Array.from(new Uint8Array(buffer).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function distanceMeters(lat, lng, targetLat, targetLng) {
  const rad = Math.PI / 180;
  const a = Math.sin((targetLat - lat) * rad / 2) ** 2
    + Math.cos(lat * rad) * Math.cos(targetLat * rad) * Math.sin((targetLng - lng) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearbyInput(params) {
  const latitude = params.get('lat')?.trim();
  const longitude = params.get('lng')?.trim();
  const radius = params.get('radius') ?? '1200';
  const window = params.get('window') ?? '7d';
  const lat = Number(latitude), lng = Number(longitude);
  if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !radiusPresets.map(String).includes(radius)
    || !['today', 'weekend', '7d', '14d', '30d'].includes(window)) return null;
  return { lat, lng, radius: Number(radius), window };
}

export async function readNearby(db, { lat, lng, radius, window }, now = Date.now()) {
  const latDelta = radius / 111_194.9;
  const minLat = Math.max(-90, lat - latDelta), maxLat = Math.min(90, lat + latDelta);
  const lngDelta = Math.min(180, latDelta / Math.max(0.000001, Math.cos(Math.max(Math.abs(minLat), Math.abs(maxLat)) * Math.PI / 180)));
  const minLng = lng - lngDelta, maxLng = lng + lngDelta;
  const results = await all(db, `SELECT o.*, v.name AS venue_name, v.address, v.city, v.region AS venue_region,
      v.latitude, v.longitude, v.timezone, p.name AS publisher, p.id AS publisher_id, p.category,
      p.status AS publisher_status, p.last_success, p.last_attempt, e.status, e.checked_at,
      e.url, e.booking_url, json_extract(p.config, '$.authority') AS authority
    FROM event_venues v JOIN event_occurrences o ON v.id = o.venue_id
      JOIN event_evidence e ON o.id = e.occurrence_id JOIN event_publishers p ON e.publisher_id = p.id
    WHERE v.latitude BETWEEN ? AND ? AND (v.longitude BETWEEN ? AND ?
      OR v.longitude + 360 BETWEEN ? AND ? OR v.longitude - 360 BETWEEN ? AND ?)
      AND o.end_at > ? AND o.start_at < ? AND e.status != 'withdrawn'
      AND p.status NOT IN ('retired', 'needs_approval', 'needs_credentials')
      AND (e.checked_at >= ? OR e.status IN ('cancelled', 'superseded'))
    ORDER BY o.start_at, o.id, COALESCE(authority, 2) DESC, e.checked_at DESC, p.id`,
  minLat, maxLat, minLng, maxLng, minLng, maxLng, minLng, maxLng, now, now + 32 * dayMs, now - freshFor);
  const occurrences = new Map();
  const windows = new Map();
  let partial = false;
  for (const row of results) {
    const meters = distanceMeters(lat, lng, row.latitude, row.longitude);
    if (meters > radius) continue;
    if (!windows.has(row.timezone)) windows.set(row.timezone, dateWindow(now, row.timezone, window));
    const bounds = windows.get(row.timezone);
    if (row.start_at >= bounds.end || row.end_at <= bounds.start) continue;
    if (['failing', 'needs_adapter'].includes(row.publisher_status)) partial = true;
    if (!occurrences.has(row.id)) occurrences.set(row.id, { row, meters, sources: new Map() });
    if (row.status === 'active') {
      occurrences.get(row.id).sources.set(row.url, {
        publisher: row.publisher, url: row.url, bookingUrl: row.booking_url,
      });
    }
  }
  const cards = new Map();
  for (const { row, meters, sources } of occurrences.values()) {
    if (row.status !== 'active') continue;
    if (!cards.has(row.series_id)) {
      cards.set(row.series_id, {
        id: row.series_id, title: row.title, category: row.category, distanceMeters: meters,
        venue: {
          id: row.venue_id, name: row.venue_name, address: row.address, city: row.city,
          region: row.venue_region, lat: row.latitude, lng: row.longitude, timezone: row.timezone,
        },
        sessions: [],
      });
    }
    cards.get(row.series_id).sessions.push({
      id: row.id, kind: row.kind,
      start: row.kind === 'timed' ? new Date(row.start_at).toISOString() : row.start_date,
      end: row.kind === 'timed' ? (row.has_end ? new Date(row.end_at).toISOString() : null) : row.end_date,
      sources: [...sources.values()],
    });
  }
  return { events: [...cards.values()], partial };
}

export async function seedPublishers(db, records) {
  for (let offset = 0; offset < records.length; offset += 40) {
    const values = JSON.stringify(records.slice(offset, offset + 40));
    await run(db, `INSERT INTO event_publishers (id, name, region, coverage, url, category, cohort, config, status, last_error)
      SELECT value ->> '$.id', value ->> '$.name', value ->> '$.region', value ->> '$.coverage',
        value ->> '$.url', value ->> '$.category', value ->> '$.cohort', value -> '$.config', value ->> '$.status', value ->> '$.reason'
      FROM json_each(?) WHERE 1
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, region = excluded.region, coverage = excluded.coverage,
        url = excluded.url, category = excluded.category, config = excluded.config,
        next_check = CASE WHEN event_publishers.config != excluded.config OR event_publishers.status = 'retired' THEN 0 ELSE event_publishers.next_check END,
        status = CASE WHEN excluded.status LIKE 'needs_%' OR event_publishers.config != excluded.config OR event_publishers.status = 'retired'
          THEN excluded.status ELSE event_publishers.status END,
        last_error = COALESCE(excluded.last_error, event_publishers.last_error)
      WHERE event_publishers.lease IS NULL OR event_publishers.lease_until <= ?`, values, Date.now());
  }
}

export function listDue(db, { now = Date.now(), limit = 4, source, cohort, force = false, qualification = false } = {}) {
  if (qualification) return all(db, `SELECT id FROM event_publishers WHERE cohort = 'additional' AND status = 'fetching'
    AND verified > 0 AND checks = first_verified_check AND lease_until <= ? ORDER BY id LIMIT ?`, now, limit);
  return all(db, `SELECT id FROM event_publishers WHERE ${claimable} AND lease_until <= ?
    AND (? OR next_check <= ?) AND (? IS NULL OR id = ?) AND (? IS NULL OR cohort = ?)
    ORDER BY next_check, id LIMIT ?`,
  now, Number(force), now, source ?? null, source ?? null, cohort ?? null, cohort ?? null, limit);
}

export async function claimPublisher(db, id, now, force) {
  const lease = crypto.randomUUID();
  const row = await first(db, `UPDATE event_publishers SET lease = ?, lease_until = ?, last_attempt = ?
    WHERE id = ? AND ${claimable} AND lease_until <= ? AND (? OR next_check <= ?) RETURNING *`,
  lease, now + lockFor, now, id, now, Number(force), now);
  return row && { ...row, config: JSON.parse(row.config) };
}

export async function recordPublisherIssue(db, source, status, error, now = Date.now()) {
  const next = now + Math.min(dayMs, 20 * 60_000 * 2 ** Math.min(source.failures, 10));
  await run(db, `UPDATE event_publishers SET status = ?, last_error = ?, failures = failures + 1,
    next_check = ?, lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?`,
  status, error, next, source.id, source.lease);
}

export async function recordPublisherResults(db, source, rows, { now = Date.now(), complete = false, holds = [] } = {}) {
  const data = JSON.stringify(rows);
  const lease = [source.id, source.lease];
  const active = rows.filter(row => row.status === 'active' && row.endAt > now).length;
  const statements = [
    query(db, `INSERT INTO event_venues (id, name, address, city, region, latitude, longitude, timezone, evidence_url)
      SELECT value ->> '$.venue.id', value ->> '$.venue.name', value ->> '$.venue.address', value ->> '$.venue.city',
        value ->> '$.venue.region', value ->> '$.venue.lat', value ->> '$.venue.lng',
        value ->> '$.venue.timezone', value ->> '$.venue.url'
      FROM json_each(?) WHERE value ->> '$.venue.id' IS NOT NULL AND ${hasLease}
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, address = excluded.address,
        city = excluded.city, region = excluded.region, timezone = excluded.timezone,
        latitude = excluded.latitude, longitude = excluded.longitude, evidence_url = excluded.evidence_url`, data, ...lease),
    query(db, `INSERT INTO event_occurrences (id, series_id, venue_id, title, kind, start_at, end_at, start_date, end_date, has_end)
      SELECT value ->> '$.id', value ->> '$.seriesId', value ->> '$.venue.id', value ->> '$.title',
        value ->> '$.kind', value ->> '$.startAt', value ->> '$.endAt', value ->> '$.startDate',
        value ->> '$.endDate', value ->> '$.hasEnd'
      FROM json_each(?) WHERE value ->> '$.id' IS NOT NULL AND ${hasLease}
      ON CONFLICT (id) DO UPDATE SET end_at = excluded.end_at, end_date = excluded.end_date, has_end = excluded.has_end`, data, ...lease),
    query(db, `UPDATE event_evidence AS old SET checked_at = ?, status = COALESCE(
      (SELECT CASE WHEN value ->> '$.status' = 'active' THEN 'superseded' ELSE value ->> '$.status' END
        FROM json_each(?) WHERE value ->> '$.externalId' = old.external_id
          AND (value ->> '$.id' IS NULL OR value ->> '$.id' != old.occurrence_id) LIMIT 1), old.status)
      WHERE publisher_id = ? AND external_id IN (SELECT value ->> '$.externalId' FROM json_each(?))
        AND ${hasLease}`, now, data, source.id, data, ...lease),
    query(db, `INSERT INTO event_evidence (publisher_id, external_id, occurrence_id, url, booking_url, status, checked_at)
      SELECT ?, value ->> '$.externalId', value ->> '$.id', value ->> '$.url', value ->> '$.bookingUrl',
        value ->> '$.status', ? FROM json_each(?) WHERE value ->> '$.id' IS NOT NULL AND ${hasLease}
      ON CONFLICT (publisher_id, external_id, occurrence_id) DO UPDATE SET url = excluded.url,
        booking_url = excluded.booking_url, status = excluded.status, checked_at = excluded.checked_at`,
    source.id, now, data, ...lease),
  ];
  if (complete) statements.push(query(db, `UPDATE event_evidence SET status = 'withdrawn'
    WHERE publisher_id = ? AND status = 'active' AND checked_at < ? AND ${hasLease}
      AND occurrence_id IN (SELECT id FROM event_occurrences WHERE start_at >= ? AND start_at < ?)`,
  source.id, now, ...lease, now + dayMs, now + 29 * dayMs));
  statements.push(query(db, `DELETE FROM event_holds WHERE publisher_id = ? AND ${hasLease}`, source.id, ...lease));
  statements.push(query(db, `INSERT OR REPLACE INTO event_holds (publisher_id, external_id, title, url, reason, checked_at)
    SELECT ?, value ->> '$.externalId', value ->> '$.title', value ->> '$.url', value ->> '$.reason', ?
    FROM json_each(?) WHERE ${hasLease}`, source.id, now, JSON.stringify(holds), ...lease));
  statements.push(query(db, `UPDATE event_publishers SET status = 'fetching', last_success = ?,
    next_check = ?, failures = 0, last_error = NULL, checks = checks + 1, verified = ?,
    first_verified_check = COALESCE(first_verified_check, CASE WHEN ? > 0 THEN checks + 1 END),
    lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?`,
  now, now + 12 * hourMs, active, active, ...lease));
  const result = await db.batch(statements);
  return result.at(-1).meta.changes ? active : 0;
}

export async function sourceReport(db) {
  const sources = await all(db, `SELECT id, name, region, coverage, url, category, cohort, status,
    json_extract(config, '$.ingest.access') AS access, json_extract(config, '$.ingest.adapter') AS adapter,
    last_attempt, last_success, next_check, checks, verified, last_error,
    (SELECT COUNT(*) FROM event_holds WHERE publisher_id = event_publishers.id) AS held,
    CASE WHEN status = 'fetching' AND verified > 0 AND checks > first_verified_check THEN 1 ELSE 0 END AS qualified
    FROM event_publishers WHERE status != 'retired' ORDER BY cohort, region, name`);
  const counts = {};
  for (const source of sources) counts[source.status] = (counts[source.status] ?? 0) + 1;
  return {
    total: sources.length, counts,
    qualifiedAdditions: sources.filter(source => source.cohort === 'additional' && source.qualified).length,
    sources,
  };
}
