import lookupTimezone from '@photostructure/tz-lookup';
import venueDirectory from '../../data/event-venues.json' with { type: 'json' };
import { dayMs } from './time.mjs';
import { first, fold, recordId, run } from './store.mjs';
import { plain, publicUrl } from './publishers.mjs';

const provinces = {
  ab: 'AB', alberta: 'AB', bc: 'BC', 'british columbia': 'BC', 'colombie britannique': 'BC',
  mb: 'MB', manitoba: 'MB', nb: 'NB', 'new brunswick': 'NB', 'nouveau brunswick': 'NB',
  nl: 'NL', 'newfoundland and labrador': 'NL', 'terre neuve et labrador': 'NL',
  ns: 'NS', 'nova scotia': 'NS', 'nouvelle ecosse': 'NS', nt: 'NT', 'northwest territories': 'NT',
  nu: 'NU', nunavut: 'NU', on: 'ON', ontario: 'ON', pe: 'PE', pei: 'PE', 'prince edward island': 'PE',
  qc: 'QC', quebec: 'QC', sk: 'SK', saskatchewan: 'SK', yt: 'YT', yukon: 'YT',
};
const vagueVenue = /^(?:online|virtual|zoom|tba|tbd|various(?: locations)?|multiple(?: locations)?|canada|to be (?:announced|determined)|en ligne|a confirmer)$/i;
const postalCode = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i;
let nextPublicLookup = 0;

export function provinceCode(region) {
  return provinces[fold(region)] ?? null;
}

function streetKey(value) {
  return fold(value).replace(/\b(street|avenue|road|drive|boulevard|crescent|highway)\b/g,
    term => ({ street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', crescent: 'cres', highway: 'hwy' })[term]);
}

function validCanadaPoint(lat, lng) {
  return Number.isFinite(lat) && lat >= 41.6 && lat <= 83.2 && Number.isFinite(lng) && lng >= -141.1 && lng <= -52.4;
}

export function venueFromLocation(location, source) {
  const parts = plain(location).split(/\s*,\s*/).filter(Boolean);
  const addressIndex = parts.findIndex(part => /^\d+\s+\p{L}/u.test(part));
  const name = addressIndex === 0 ? parts[0] : parts[0] ?? '';
  const city = addressIndex >= 0 ? parts[addressIndex + 1] : parts[1];
  return {
    name, address: addressIndex >= 0 ? parts[addressIndex] : null,
    city: city && !provinceCode(city) && !postalCode.test(city) && fold(city) !== 'canada' ? city : null,
    region: parts.find(part => provinceCode(part)) ?? source.region,
    postal: parts.find(part => postalCode.test(part))?.match(postalCode)?.[0],
    country: parts.find(part => /^canada$/i.test(part)),
  };
}

function matches(feature, venue) {
  const p = feature.properties ?? {};
  if (p.countrycode !== 'CA' || feature.geometry?.type !== 'Point') return false;
  if (venue.region && provinceCode(p.state) && venue.region !== provinceCode(p.state)) return false;
  const locality = fold(venue.city);
  const localities = [p.city, p.town, p.village, p.district, p.locality, p.county, p.name].map(fold);
  const sameLocality = !locality || localities.includes(locality);
  const samePostal = venue.postal && p.postcode && fold(venue.postal).replaceAll(' ', '') === fold(p.postcode).replaceAll(' ', '');
  const address = venue.address?.match(/^(\d+[A-Z]?)\s+(.+)$/i);
  if (address) {
    if (fold(p.housenumber) !== fold(address[1])) return false;
    return Boolean((sameLocality || samePostal) && streetKey(p.street) === streetKey(address[2]));
  }
  return sameLocality && fold(p.name) === fold(venue.name) && !['place', 'boundary'].includes(p.osm_key);
}

function matchesCanadianGeolocator(entry, venue) {
  if (!validCanadaPoint(entry.lat, entry.lng) || (venue.region && provinceCode(entry.province) !== venue.region)) return false;
  const [label, ...details] = String(entry.name).split(/,\s*/);
  const number = venue.address?.match(/^(\d+[A-Z]?)\s+(.+)$/i);
  if (entry.key === 'locate' && number) {
    return entry.tag?.includes('INTERPOLATED_POSITION') && streetKey(label) === streetKey(venue.address)
      && (!venue.city || fold(details[0]).includes(fold(venue.city)));
  }
  if (entry.key !== 'nominatim' || /city|town|village|neighbou?rhood|county|province/i.test(entry.category)) return false;
  if (number && (streetKey(`${details[0]} ${details[1]}`) === streetKey(venue.address)
    || streetKey(`${label} ${details[0]}`) === streetKey(venue.address))) return true;
  return fold(label) === fold(venue.name) && (!number || fold(details[0]) === fold(number[1]));
}

async function geocode(venue, env, db, fetcher, signal) {
  const key = [streetKey(venue.address ?? venue.name), fold(venue.city), venue.region, fold(venue.postal)].join('|');
  const now = Date.now();
  const cached = await first(db, 'SELECT result FROM event_geocodes WHERE address_key = ? AND expires_at > ?', key, now);
  if (cached) return cached.result && JSON.parse(cached.result);
  if (env.PATRIA_EVENTS_GEOCODE === 'off') return null;
  const photon = env.PATRIA_PHOTON_URL;
  const url = photon ? new URL('/api/', photon) : new URL('https://geolocator.api.geo.ca/');
  const q = [venue.address || venue.name, venue.city, venue.region].filter(Boolean).join(' ');
  url.search = new URLSearchParams(photon ? { q, countrycode: 'CA', limit: '6' } : { q, keys: 'locate,nominatim' });
  if (!env.PATRIA_PHOTON_URL) {
    const wait = Math.max(0, nextPublicLookup - Date.now());
    nextPublicLookup = Math.max(Date.now(), nextPublicLookup) + 1100;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  }
  const timeout = AbortSignal.timeout(5000);
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`Venue lookup returned HTTP ${response.status}.`);
  const data = await response.json();
  const candidates = photon ? (Array.isArray(data.features) ? data.features.filter(feature => matches(feature, venue)) : []).map(feature => {
    const { properties: p, geometry } = feature;
    const [lng, lat] = geometry.coordinates;
    return { lat, lng, address: venue.address || [p.housenumber, p.street].filter(Boolean).join(' '), city: venue.city || p.city };
  }) : (Array.isArray(data) ? data.filter(entry => matchesCanadianGeolocator(entry, venue)) : [])
    .map(({ lat, lng }) => ({ lat, lng, address: venue.address, city: venue.city }));
  let result = null;
  if (candidates.length && candidates.every(({ lng, lat }) => Math.abs(lng - candidates[0].lng) < 0.002
    && Math.abs(lat - candidates[0].lat) < 0.002)) result = candidates[0];
  await run(db, `INSERT INTO event_geocodes (address_key, result, expires_at) VALUES (?, ?, ?)
    ON CONFLICT (address_key) DO UPDATE SET result = excluded.result, expires_at = excluded.expires_at`,
  key, result ? JSON.stringify(result) : null, now + (result ? 90 : 1) * dayMs);
  return result;
}

export async function resolveVenue(input, source, { env, db, fetcher = fetch, signal, geocodeBudget }) {
  const name = plain(input?.name).slice(0, 220);
  if (!name || vagueVenue.test(fold(name))) return null;
  const directory = venueDirectory.venues.filter(venue => venue.region === source.region
    && [input.city, source.config.ingest.city, source.coverage].some(city => fold(city) === fold(venue.city)));
  const known = [source.config.venue, ...(source.config.venues ?? []), ...directory].filter(Boolean)
    .find(venue => [venue.name, ...(venue.aliases ?? [])].some(alias => fold(alias) === fold(name)));
  const country = fold(input.country || known?.country);
  if (country && country !== 'ca' && country !== 'canada') return null;
  const region = provinceCode(input.region) ?? provinceCode(known?.region) ?? provinceCode(source.region);
  const city = plain(input.city || known?.city || source.config.ingest.city).slice(0, 120) || null;
  if (!region && !country) return null;
  if (fold(name) === fold(city) || provinceCode(name)) return null;
  const venue = {
    name: plain(known?.name || name), address: plain(known?.address || input.address).slice(0, 240) || null,
    city, region, postal: input.postal || known?.postal,
    lat: Number(source.config.ingest.ignoreCoordinates ? known?.lat : input.lat ?? known?.lat),
    lng: Number(source.config.ingest.ignoreCoordinates ? known?.lng : input.lng ?? known?.lng),
    url: publicUrl(known?.url || input.url, source.url) ?? source.url,
  };
  if (!validCanadaPoint(venue.lat, venue.lng)) {
    if (geocodeBudget.left <= 0) return null;
    geocodeBudget.left--;
    const result = await geocode(venue, env, db, fetcher, signal);
    if (!result || !validCanadaPoint(result.lat, result.lng)) return null;
    Object.assign(venue, result);
  }
  venue.timezone = lookupTimezone(venue.lat, venue.lng);
  if (source.config.ingest.timeZone && source.config.ingest.overrideTimeZone) venue.timezone = source.config.ingest.timeZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: venue.timezone }); } catch { return null; }
  venue.id = await recordId('venue', venue.region, fold(venue.city), streetKey(venue.address || venue.name));
  return venue;
}
