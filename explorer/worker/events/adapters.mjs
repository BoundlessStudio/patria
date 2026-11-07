import ICAL from 'ical.js';
import { parseDocument } from 'htmlparser2';
import { selectAll, selectOne } from 'css-select';
import { textContent } from 'domutils';
import { dayMs, localDate } from './time.mjs';
import { fetchPublished, plain, publicUrl, PublisherIssue } from './publishers.mjs';
import { venueFromLocation } from './venues.mjs';

const horizon = 45 * dayMs;
const maxRows = 320;

function shortType(value) {
  return typeof value === 'string' ? value.split(/[\/#:]/).at(-1) : '';
}

function statusOf(value) {
  const status = shortType(value).toLowerCase();
  if (/cancel|movedonline/.test(status)) return 'cancelled';
  if (/postpon/.test(status)) return 'superseded';
  return 'active';
}

function icalTime(time, useWallTime) {
  if (!time) return null;
  if (time.isDate || (useWallTime && time.zone !== ICAL.Timezone.utcTimezone) || time.zone === ICAL.Timezone.localTimezone) return time.toString();
  return new Date(time.toUnixTime() * 1000).toISOString();
}

function sequence(component) {
  return [Number(component.getFirstPropertyValue('sequence') ?? 0), component.getFirstPropertyValue('dtstamp')?.toString() ?? ''];
}

function preferRevision(existing, candidate) {
  if (!existing) return candidate;
  const [prevSequence, prevStamp] = sequence(existing);
  const [nextSequence, nextStamp] = sequence(candidate);
  return nextSequence > prevSequence || (nextSequence === prevSequence && nextStamp >= prevStamp) ? candidate : existing;
}

function icalRow(component, original, start, end, recurrenceId, source, page) {
  const read = key => component.getFirstPropertyValue(key) ?? original.getFirstPropertyValue(key);
  const uid = read('uid');
  const communico = source.config.ingest.adapter === 'communico-ical';
  const override = source.config.ingest.overrideTimeZone;
  const geo = read('geo');
  const location = venueFromLocation(read('location'), source);
  if (Array.isArray(geo)) [location.lat, location.lng] = geo;
  const timezone = override ? source.config.ingest.timeZone
    : component.getFirstProperty('dtstart')?.getParameter('tzid') || original.getFirstProperty('dtstart')?.getParameter('tzid');
  let useWallTime = Boolean(override);
  if (timezone) {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); useWallTime = true; } catch { /* Embedded VTIMEZONE may still provide an offset. */ }
  }
  const explicitlyHasEnd = component.hasProperty('dtend') || component.hasProperty('duration')
    || original.hasProperty('dtend') || original.hasProperty('duration');
  return {
    externalId: recurrenceId ? `${uid}#${recurrenceId}` : uid,
    title: read('summary'), start: icalTime(start, useWallTime),
    end: explicitlyHasEnd ? icalTime(end, useWallTime) : null, endExclusive: true, timezone,
    status: /^(?:PRIVATE|CONFIDENTIAL)$/i.test(read('class')) ? 'superseded' : statusOf(read('status')), venue: location,
    url: publicUrl(read('url'), page) ?? (communico && /^\d+$/.test(uid) ? new URL(`/event/${uid}`, source.url).href : source.url),
  };
}

export function parseCalendar(text, source, page, now) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  if (calendar.name !== 'vcalendar') throw new Error('Invalid iCalendar response.');
  const groups = new Map();
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const uid = component.getFirstPropertyValue('uid');
    if (!uid) continue;
    const key = component.getFirstPropertyValue('recurrence-id')?.toString() ?? '';
    if (!groups.has(uid)) groups.set(uid, new Map());
    const revisions = groups.get(uid);
    revisions.set(key, preferRevision(revisions.get(key), component));
  }
  const rows = [];
  const minimum = new Date(now - 2 * dayMs).toISOString().slice(0, 10);
  const maximum = new Date(now + horizon).toISOString().slice(0, 10);
  const relevant = (start, end, status) => status !== 'active' && !start
    || start && start.toString().slice(0, 10) <= maximum && (end ?? start).toString().slice(0, 10) >= minimum;
  for (const revisions of groups.values()) {
    const master = revisions.get('');
    const attached = new Set();
    if (master?.getFirstPropertyValue('dtstart')) {
      const exceptions = [...revisions.entries()].filter(([key, value]) => key && value.getFirstPropertyValue('dtstart'));
      const event = new ICAL.Event(master, { exceptions: exceptions.map(([, value]) => value) });
      if (event.isRecurring()) {
        const iterator = event.iterator();
        for (let step = 0; step < 3000 && rows.length < maxRows; step++) {
          const original = iterator.next();
          if (!original || original.toString().slice(0, 10) > maximum) break;
          if (original.toString().slice(0, 10) < minimum) continue;
          const key = original.toString();
          const revision = revisions.get(key);
          const actual = event.getOccurrenceDetails(original);
          const active = revision ?? actual.item.component;
          rows.push(icalRow(active, master, actual.startDate, actual.endDate, key, source, page));
          if (revision) attached.add(key);
        }
        for (const exclusion of master.getAllProperties('exdate').flatMap(property => property.getValues())) {
          const key = exclusion.toString();
          if (key.slice(0, 10) >= minimum && key.slice(0, 10) <= maximum && !revisions.has(key)) {
            rows.push({ externalId: `${event.uid}#${key}`, status: 'cancelled', url: source.url });
          }
        }
      } else {
        if (relevant(event.startDate, event.endDate, statusOf(master.getFirstPropertyValue('status')))) {
          rows.push(icalRow(master, master, event.startDate, event.endDate, '', source, page));
        }
      }
    }
    for (const [key, revision] of revisions) {
      if ((key && !attached.has(key)) || (!key && !revision.getFirstPropertyValue('dtstart'))) {
        const event = new ICAL.Event(revision, { exceptions: [] });
        const end = event.startDate ? event.endDate : null;
        if (relevant(event.startDate, end, statusOf(revision.getFirstPropertyValue('status')))) {
          rows.push(icalRow(revision, master ?? revision, event.startDate, end, key, source, page));
        }
      }
    }
  }
  return rows.sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? ''))).slice(0, maxRows);
}

function fromTribe(event) {
  const venue = Array.isArray(event.venue) ? event.venue[0] : event.venue;
  const status = statusOf(event.event_status || event.status);
  const time = (local, utc) => event.all_day ? local?.slice(0, 10)
    : /^\d{4}-\d{2}-\d{2} /.test(utc ?? '') && !utc.startsWith('0000') ? `${utc.replace(' ', 'T')}Z` : local;
  return {
    externalId: event.id, title: event.title, status, url: event.url, bookingUrl: event.website,
    start: time(event.start_date, event.utc_start_date ?? event.start_date_utc),
    end: time(event.end_date, event.utc_end_date ?? event.end_date_utc), timezone: event.timezone,
    venue: venue && {
      name: venue.venue, address: venue.address, city: venue.city, region: venue.stateprovince ?? venue.province,
      postal: venue.zip, country: venue.country, lat: venue.geo_lat, lng: venue.geo_lng, url: venue.url,
    },
  };
}

function schemaEvents(document, page, source) {
  const entries = [];
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return;
    if (Array.isArray(value)) { for (const node of value) visit(node, depth + 1); return; }
    if (value['@type'] || value['@id']) entries.push(value);
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'subEvent']) visit(value[key], depth + 1);
  }
  for (const script of selectAll('script[type="application/ld+json"]', document.children)) {
    try { visit(JSON.parse(textContent(script).replace(/^\s*<!--|-->\s*$/g, ''))); } catch { /* Other scripts can still carry valid data. */ }
  }
  const byId = new Map(entries.filter(item => item['@id'] && Object.keys(item).length > 1).map(item => [item['@id'], item]));
  return entries.filter(event => [event['@type']].flat().some(type => /Event$/.test(shortType(type)))).map(event => {
    const location = [event.location].flat().map(place => byId.get(place?.['@id']) ?? place)
      .find(place => place && shortType(place['@type']) !== 'VirtualLocation');
    const address = location?.address;
    const geo = location?.geo;
    const offer = [event.offers].flat().find(item => item?.url);
    const url = publicUrl(event.url, page) ?? page;
    return {
      externalId: event.identifier?.value ?? event.identifier ?? event['@id'] ?? `${url}#${event.previousStartDate ?? event.startDate ?? event.name}`,
      title: event.name, start: event.startDate, end: event.endDate, previousStart: event.previousStartDate,
      status: shortType(event.eventAttendanceMode) === 'OnlineEventAttendanceMode' ? 'cancelled' : statusOf(event.eventStatus),
      url, bookingUrl: offer?.url,
      venue: source.config.ingest.venueTextEvidence && plain(event.description).normalize('NFKC').toLowerCase()
        .includes(source.config.ingest.venueTextEvidence.normalize('NFKC').toLowerCase())
        ? { name: source.config.ingest.venueName, city: source.config.ingest.city }
        : location && typeof location === 'object' && {
        name: location.name, address: typeof address === 'string' ? address : address?.streetAddress, city: address?.addressLocality,
        region: address?.addressRegion, postal: address?.postalCode, country: address?.addressCountry?.name ?? address?.addressCountry,
        lat: geo?.latitude, lng: geo?.longitude, url: location.url,
      },
    };
  });
}

export function calendarLinks(document, page) {
  return [...new Set(selectAll('a[href], link[href]', document.children).map(link => publicUrl(link.attribs.href, page)).filter(Boolean))];
}

function isCalendarFeed(url) {
  return /(?:\.ics(?:\?|$)|\/public\/ics\/|(?:ical|tribe_event_display)=1|\.php\?[^#]*format=ical)/i.test(url);
}

export function isListingLink(url) {
  return /\/(?:events?|eventos?|evenements?|calendars?|calendriers?|agenda|activities|activites|programs?|programmation|whats-?on|what-s-on|workshops?|ateliers?|exhibitions?|expositions?|spectacles?)(?:[/?#_-]|$)/i.test(new URL(url).pathname);
}

function calendarPayload(payload, source, now) {
  if (/(?:^|\n)BEGIN:VCALENDAR\b/.test(payload.text.trimStart())) return parseCalendar(payload.text, source, payload.url, now);
  return null;
}

async function getTribe(source, fetchPage, now) {
  const url = new URL(source.config.ingest.endpoints[0]);
  url.searchParams.set('per_page', '50');
  url.searchParams.set('start_date', new Date(now - 2 * dayMs).toISOString().slice(0, 10));
  url.searchParams.set('end_date', new Date(now + horizon).toISOString().slice(0, 10));
  const rows = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(4, pages); page++) {
    url.searchParams.set('page', String(page));
    const data = JSON.parse((await fetchPage(url.href, 'application/json')).text);
    if (!Array.isArray(data.events)) throw new Error('Calendar returned an unexpected events payload.');
    pages = Number(data.total_pages) || 1;
    rows.push(...data.events.map(fromTribe));
  }
  return { rows, complete: pages <= 4 };
}

async function getPageCalendar(source, fetchPage, now) {
  const entry = source.config.ingest.endpoints?.[0] || source.url;
  const page = await fetchPage(entry);
  const calendar = calendarPayload(page, source, now);
  if (calendar) return { rows: calendar, complete: false };
  const document = parseDocument(page.text);
  const links = calendarLinks(document, page.url);
  const publisherHost = new URL(page.url).hostname;
  const samePublisher = url => new URL(url).hostname === publisherHost;
  const feeds = links.filter(url => samePublisher(url) && isCalendarFeed(url));
  const rows = schemaEvents(document, page.url, source);
  if (!rows.length) for (const feed of feeds.slice(0, 4)) {
    try {
      const payload = await fetchPage(feed, 'text/calendar,*/*');
      rows.push(...(calendarPayload(payload, source, now) ?? []));
    } catch { /* Other supported formats can still work. */ }
  }
  const detail = links.filter(url => samePublisher(url) && isListingLink(url)
    && /\/(?:event|evenement|exhibition|exposition|spectacle)\/[^/?]+/i.test(new URL(url).pathname) && url !== page.url);
  for (const url of detail.slice(0, rows.length ? 3 : 8)) {
    try {
      const item = await fetchPage(url);
      rows.push(...schemaEvents(parseDocument(item.text), item.url, source));
    } catch { /* A listing can expire while other links remain available. */ }
  }
  if (rows.length || /application\/ld\+json/i.test(page.text) && source.config.ingest.adapter === 'json-ld') {
    return { rows: rows.slice(0, maxRows), complete: false };
  }
  throw new PublisherIssue('needs_adapter', 'The public page has no supported event feed or structured listings.');
}

const nodeText = (selector, node) => {
  const value = selectOne(selector, node.children);
  return value ? plain(textContent(value)) : '';
};

async function getDatedCards(source, fetchPage, style) {
  const page = await fetchPage(source.config.ingest.endpoints?.[0] ?? source.url);
  const dom = parseDocument(page.text);
  const moncton = style === 'moncton-calendar';
  const selector = moncton ? '.row:has(h2 > a.stretched-link):has(.geo-icon)' : '.events-calendar-wrapper > li';
  const items = selectAll(selector, dom.children);
  if (!items.length) throw new PublisherIssue('needs_adapter', 'The publisher calendar layout has changed.');
  const rows = items.map(item => {
    const link = selectOne(moncton ? 'h2 > a.stretched-link' : 'h3 > a', item.children);
    const [start, end] = selectAll(moncton ? '.calendar-icon time[datetime]' : '.date-wrapper time[datetime]', item.children)
      .map(node => node.attribs.datetime);
    const title = link && plain(textContent(link));
    const url = publicUrl(link?.attribs.href, page.url);
    const name = nodeText(moncton ? '.geo-icon' : '.locations-wrapper', item);
    return { externalId: url, title, url, start, end, status: 'active',
      venue: { name, city: source.config.ingest.city } };
  });
  return { rows, complete: false };
}

function ampm(text) {
  const time = text?.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  return time && `${String(Number(time[1]) % 12 + (time[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${time[2] ?? '00'}`;
}

async function getMuseumLocation(source, fetchPage) {
  const page = await fetchPage(source.config.ingest.endpoints[0]);
  const rows = selectAll('.em-location-single li:has(a)', parseDocument(page.text).children).flatMap(item => {
    const link = selectOne('a', item.children);
    const date = plain(textContent(item)).match(/\b(\d{2})\/(\d{2})\/(\d{4})\b(?:\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m))?/i);
    if (!date) return [];
    const [ , day, month, year, first, last ] = date;
    const calendarDate = `${year}-${month}-${day}`;
    const startTime = ampm(first), endTime = ampm(last);
    const url = publicUrl(link.attribs.href, page.url);
    return [{ externalId: `${url}#${calendarDate}`, url, title: textContent(link), status: 'active',
      start: startTime ? `${calendarDate}T${startTime}` : calendarDate,
      end: endTime ? `${calendarDate}T${endTime}` : null, venue: source.config.venue }];
  });
  return { rows, complete: false };
}

async function getGrowthZone(source, fetchPage, now) {
  const page = await fetchPage(source.config.ingest.endpoints[0]);
  const links = calendarLinks(parseDocument(page.text), page.url).filter(url => new URL(url).origin === new URL(page.url).origin
    && /\/events\/details\/[^/]+/.test(new URL(url).pathname));
  const rows = [];
  for (const link of links.slice(0, 6)) {
    const detail = new URL(link);
    const endpoint = `${detail.origin}${detail.pathname.replace('/events/details/', '/events/ical/')}.ics`;
    try {
      const payload = await fetchPage(endpoint, 'text/calendar,*/*');
      for (const row of calendarPayload(payload, source, now) ?? []) {
        const matched = (source.config.venues ?? []).filter(venue => [venue.name, ...(venue.aliases ?? [])].some(alias =>
          plain(row.venue?.name).toLowerCase().includes(alias.toLowerCase())));
        if (matched.length) for (const venue of matched) rows.push({ ...row, url: link, venue, externalId: `${row.externalId}:${venue.name}` });
        else rows.push({ ...row, url: link });
      }
    } catch { /* The calendar can contain links whose event has expired. */ }
  }
  return { rows, complete: false };
}

async function getNanaimo(source, fetchPage, now) {
  const today = localDate(now, 'America/Vancouver');
  const rows = [];
  const months = [today, today.add({ months: 1 }).with({ day: 1 })];
  const parse = value => {
    const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) return null;
    const [, month, day, year, hour, minute] = match;
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return { date, time: hour && `${date}T${hour.padStart(2, '0')}:${minute}` };
  };
  for (const date of months) {
    const form = new URLSearchParams({ showDate: `${date.month}/${date.day}/${date.year}`, viewtype: 'month',
      timezone: '-7', calendarName: 'Public Events', calendarUrl: '', calendarTitle: '' });
    const page = await fetchPage(source.config.ingest.endpoints[0], 'application/json', form);
    const { events } = JSON.parse(page.text);
    if (!Array.isArray(events)) throw new Error('Calendar returned an unexpected Nanaimo events payload.');
    for (const event of events) {
      const [id, title, starts, ends, allDay] = event;
      const start = parse(starts), end = parse(ends);
      if (!start) continue;
      const url = publicUrl(event[11], source.url) ?? source.url;
      rows.push({ externalId: id, title, url, status: 'active', timezone: 'America/Vancouver',
        start: allDay === true || allDay === 1 ? start.date : start.time ?? start.date,
        end: allDay === true || allDay === 1 ? end?.date : end?.time, venue: { name: event[9], city: 'Nanaimo' } });
    }
  }
  return { rows, complete: false };
}

async function getEdmonton(source, fetchPage, now) {
  const [schedule, locations] = source.config.ingest.endpoints;
  const url = new URL(schedule);
  const start = new Date(now - dayMs).toISOString().slice(0, 10);
  const end = new Date(now + 32 * dayMs).toISOString().slice(0, 10);
  url.search = new URLSearchParams({
    '$select': 'bookingid,activity,startdatetime,enddatetime,facilityguid',
    '$where': `startdatetime >= '${start}' AND startdatetime < '${end}'`, '$limit': String(maxRows),
    '$order': 'startdatetime,bookingid',
  });
  const [data, facilities] = await Promise.all([url.href, locations].map(async endpoint =>
    JSON.parse((await fetchPage(endpoint, 'application/json')).text)));
  if (!Array.isArray(data) || !Array.isArray(facilities)) throw new Error('Calendar returned an unexpected recreation payload.');
  const byId = new Map(facilities.map(row => [row.locationguid, row]));
  const rows = data.map(activity => {
    const venue = byId.get(activity.facilityguid);
    return {
      externalId: activity.bookingid, title: activity.activity, start: activity.startdatetime, end: activity.enddatetime,
      status: 'active', url: source.url, timezone: 'America/Edmonton',
      venue: venue && { name: venue.location_name, address: venue.address, city: venue.city, region: venue.province,
        postal: venue.postal_code, country: venue.country, lat: venue.latitude, lng: venue.longitude, url: locations },
    };
  });
  return { rows, complete: false };
}

export async function fetchOccurrences(source, { fetcher = fetch, signal, now = Date.now() } = {}) {
  const fetchPage = (url, accept, form) => fetchPublished(url, { fetcher, signal, accept, form });
  const { adapter, endpoints } = source.config.ingest;
  if (['tribe-rest', 'the-events-calendar'].includes(adapter)) return getTribe(source, fetchPage, now);
  if (adapter === 'edmonton-socrata-recreation') return getEdmonton(source, fetchPage, now);
  if (['moncton-calendar', 'parks-canada-calendar'].includes(adapter)) return getDatedCards(source, fetchPage, adapter);
  if (adapter === 'nanaimo-museum-calendar') return getMuseumLocation(source, fetchPage);
  if (adapter === 'growthzone-ical-index') return getGrowthZone(source, fetchPage, now);
  if (adapter === 'nanaimo-city-calendar') return getNanaimo(source, fetchPage, now);
  if (['ical', 'icalendar', 'communico-ical'].includes(adapter)) {
    const rows = [];
    for (const endpoint of endpoints.slice(0, 4)) {
      const page = await fetchPage(endpoint, 'text/calendar,*/*');
      const calendar = calendarPayload(page, source, now);
      if (!calendar) throw new Error('Publisher did not return an iCalendar feed.');
      rows.push(...calendar);
    }
    return { rows: rows.slice(0, maxRows), complete: false };
  }
  if (['publisher-calendar', 'json-ld'].includes(adapter)) return getPageCalendar(source, fetchPage, now);
  throw new PublisherIssue('needs_adapter', `Adapter ${adapter} is awaiting support.`);
}
