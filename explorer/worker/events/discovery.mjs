import { parseDocument } from 'htmlparser2';
import { selectOne } from 'css-select';
import { textContent } from 'domutils';
import { calendarLinks, isListingLink } from './adapters.mjs';
import { fetchPublished, plain, publicUrl } from './publishers.mjs';
import { publisherRecord } from './registry.mjs';
import { refreshPublisher } from './refresh.mjs';
import { all, distanceMeters, first, fold, recordId, run, seedPublishers } from './store.mjs';
import { dayMs } from './time.mjs';
import { provinceCode } from './venues.mjs';

const localDirectories = [
  { city: 'Nanaimo', region: 'BC', lat: 49.165, lng: -123.936, url: 'https://www.nanaimofca.com/links' },
];
const excludedHosts = /(?:^|\.)(?:facebook\.com|instagram\.com|twitter\.com|x\.com|google\.com|youtube\.com|eventbrite\.(?:com|ca)|bibliocommons\.com|patria\.rgbknights\.com)$/i;

function hostname(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

export async function queueDiscovery(db, input, sparse, now = Date.now()) {
  const lat = Math.round(input.lat * 40) / 40;
  const lng = Math.round(input.lng * 40) / 40;
  const id = await recordId('event-area', lat, lng, input.window);
  await run(db, `INSERT INTO event_discovery (id, latitude, longitude, date_window, radius, state, run_after)
    VALUES (?, ?, ?, ?, ?, 'queued', ?) ON CONFLICT (id) DO UPDATE SET state = 'queued',
    radius = MAX(event_discovery.radius, excluded.radius), run_after = excluded.run_after
    WHERE event_discovery.run_after <= excluded.run_after AND (event_discovery.state = 'partial'
      OR (event_discovery.state = 'ready' AND ? = 1))`,
  id, lat, lng, input.window, input.radius, now, Number(sparse));
  return first(db, 'SELECT id, state, run_after, reason FROM event_discovery WHERE id = ?', id);
}

async function indexedLocality(db, job) {
  const rows = await all(db, `SELECT v.name, v.city, v.region, p.id, p.url, p.config
    FROM event_venues v JOIN event_occurrences o ON v.id = o.venue_id
      JOIN event_evidence e ON e.occurrence_id = o.id JOIN event_publishers p ON p.id = e.publisher_id
    WHERE v.latitude BETWEEN ? AND ? AND v.longitude BETWEEN ? AND ?
    GROUP BY p.id, v.city, v.name LIMIT 30`, job.latitude - 0.08, job.latitude + 0.08, job.longitude - 0.18, job.longitude + 0.18);
  const directory = localDirectories.find(item => distanceMeters(job.latitude, job.longitude, item.lat, item.lng) < 8000);
  return { city: directory?.city ?? rows.find(row => row.city)?.city,
    region: directory?.region ?? rows.find(row => row.region)?.region, rows, directory };
}

async function identifyLocality(job, fetcher, signal) {
  const url = new URL('https://geolocator.api.geo.ca/');
  url.search = new URLSearchParams({ q: `${job.latitude},${job.longitude}`, keys: 'nominatim' });
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) return {};
  const locations = await response.json();
  const entry = Array.isArray(locations) && locations.find(item => item.province && item.name);
  if (!entry) return {};
  const name = entry.name.split(', ').filter(part => !/^\d|canada|^$/i.test(part));
  return { city: name[1] ?? name[0], region: provinceCode(entry.province) };
}

async function webLeads(context, job, env, fetcher, signal, now) {
  if ((!env.PATRIA_BRAVE_SEARCH_KEY && !env.PATRIA_EVENTS_SEARCH_URL) || !context.city) return [];
  const locales = ['en', ...(context.region === 'QC' || context.region === 'NB' || context.region === 'YT' ? ['fr'] : [])];
  const span = job.date_window === 'today' ? 1 : job.date_window === 'weekend' ? 3 : Number.parseInt(job.date_window, 10);
  const dates = `${new Date(now).toISOString().slice(0, 10)} ${new Date(now + span * dayMs).toISOString().slice(0, 10)}`;
  const found = await Promise.allSettled(locales.map(async locale => {
    const url = new URL(env.PATRIA_EVENTS_SEARCH_URL || 'https://api.search.brave.com/res/v1/web/search');
    const venues = context.rows.slice(0, 2).map(row => `"${row.name}"`).join(' OR ');
    const keywords = locale === 'fr'
      ? '(calendrier OR événements OR activités OR ateliers OR marché OR loisirs OR spectacles)'
      : '(events OR calendar OR workshops OR recreation OR markets OR screenings OR exhibits)';
    url.search = new URLSearchParams({ q: `${context.city} ${context.region ?? ''} ${keywords} ${dates}${venues ? ` (${venues} OR community)` : ''}`,
      country: 'CA', search_lang: locale, count: '6' });
    const headers = { Accept: 'application/json' };
    if (url.hostname === 'api.search.brave.com' && env.PATRIA_BRAVE_SEARCH_KEY) headers['X-Subscription-Token'] = env.PATRIA_BRAVE_SEARCH_KEY;
    const response = await fetcher(url, { headers, signal, redirect: 'error' });
    if (!response.ok) throw new Error('Web search is temporarily unavailable.');
    const data = await response.json();
    return (data.web?.results ?? data.results ?? []).map(item => publicUrl(item.url)).filter(Boolean).slice(0, 6);
  }));
  if (found.every(item => item.status === 'rejected')) throw found[0].reason;
  return found.flatMap(item => item.status === 'fulfilled' ? item.value : []);
}

async function publisherCandidate(link, context, fetcher, signal) {
  const page = await fetchPublished(link, { fetcher, signal });
  const document = parseDocument(page.text);
  const host = hostname(page.url);
  const site = selectOne('meta[property="og:site_name"]', document.children)?.attribs.content;
  const title = selectOne('title', document.children);
  const name = plain(site || (title ? textContent(title).split(/\s[|–—]\s/).at(-1) : host)).slice(0, 120) || host;
  const links = calendarLinks(document, page.url);
  const calendar = links.find(url => hostname(url) === host && isListingLink(url)
    && !/\/events?\/[^/?]+\/?$/i.test(new URL(url).pathname)) ?? page.url;
  const isTribe = /tribe-events|the-events-calendar/i.test(page.text);
  const endpoints = isTribe ? [new URL('/wp-json/tribe/events/v1/events', page.url).href] : [calendar];
  const source = publisherRecord({
    id: `discovered-${await recordId(host)}`, publisher: name, region: context.region ?? 'multi',
    coverage: context.city ?? 'Canada', category: 'community', url: calendar,
    ingest: { adapter: isTribe ? 'tribe-rest' : 'publisher-calendar', access: 'public-page', endpoints, city: context.city },
  }, 'discovered');
  return { source, links };
}

export async function processDiscovery(db, id, { env = {}, fetcher = fetch, signal = AbortSignal.timeout(22_000), now = Date.now() } = {}) {
  const lease = crypto.randomUUID();
  const job = await first(db, `UPDATE event_discovery SET state = 'running', lease = ?, lease_until = ?, attempts = attempts + 1
    WHERE id = ? AND state IN ('queued', 'running') AND lease_until <= ? AND run_after <= ? RETURNING *`,
  lease, now + 120_000, id, now, now);
  if (!job) return { skipped: true };
  let failures = 0, learned = 0;
  try {
    const context = await indexedLocality(db, job);
    if (!context.city) {
      try { Object.assign(context, await identifyLocality(job, fetcher, AbortSignal.any([signal, AbortSignal.timeout(3500)]))); }
      catch { failures++; }
    }
    const nearbyPublishers = [...new Set(context.rows.map(row => row.id))].slice(0, 2);
    for (const publisher of nearbyPublishers) {
      if (signal.aborted) break;
      const outcome = await refreshPublisher(db, publisher, { env, fetcher, signal, now });
      if (outcome.error) failures++;
    }
    const known = new Set((await all(db, 'SELECT url FROM event_publishers')).map(row => hostname(row.url)));
    const anchors = [context.directory?.url, ...context.rows.flatMap(row => JSON.parse(row.config).ingest.discoveryUrls ?? []),
      ...context.rows.slice(0, 3).map(row => row.url)].filter(Boolean);
    let leads = [];
    try { leads = await webLeads(context, job, env, fetcher, AbortSignal.any([signal, AbortSignal.timeout(6000)]), now); }
    catch { failures++; }
    for (const anchor of [...new Set(anchors)].slice(0, 4)) {
      if (signal.aborted) break;
      try {
        const page = await fetchPublished(anchor, { fetcher, signal });
        const links = calendarLinks(parseDocument(page.text), page.url).filter(link => hostname(link) !== hostname(page.url));
        leads.push(...links.filter(link => isListingLink(link) || /artscouncil|community|library|tourism|culture|festival/i.test(link)));
      } catch { failures++; }
    }
    for (const link of [...new Set(leads)].filter(url => /^https:\/\//.test(url)).slice(0, 12)) {
      const host = hostname(link);
      if (signal.aborted || learned >= 3) break;
      if (excludedHosts.test(host) || known.has(host)) continue;
      known.add(host);
      try {
        const { source } = await publisherCandidate(link, context, fetcher, signal);
        if (excludedHosts.test(hostname(source.url))) continue;
        await seedPublishers(db, [source]);
        const result = await refreshPublisher(db, source.id, { env, fetcher, signal, now });
        if (result.verified) learned++;
        if (result.error && result.status !== 'needs_adapter') failures++;
      } catch { failures++; }
    }
    if (!leads.length && !anchors.length) failures++;
  } catch { failures++; }
  const partial = failures > 0 || signal.aborted;
  await run(db, `UPDATE event_discovery SET state = ?, run_after = ?, reason = ?, lease = NULL, lease_until = 0
    WHERE id = ? AND lease = ?`, partial ? 'partial' : 'ready', now + (partial ? 3_600_000 : dayMs),
  partial ? 'Some local sources could not be checked.' : null, id, lease);
  return { learned, partial };
}

export async function refreshDiscovery(db, options = {}) {
  const now = options.now ?? Date.now();
  const job = await first(db, `SELECT id FROM event_discovery WHERE state IN ('queued', 'running')
    AND run_after <= ? AND lease_until <= ? ORDER BY run_after LIMIT 1`, now, now);
  return job ? processDiscovery(db, job.id, options) : null;
}
