import baseline from '../../data/experience-sources.json' with { type: 'json' };
import expansion from '../../data/experience-sources-additional.json' with { type: 'json' };
import { publicUrl } from './publishers.mjs';
import { run, seedPublishers } from './store.mjs';

const originalOverrides = {
  'nanaimo-museum': { adapter: 'nanaimo-museum-calendar', endpoints: ['https://nanaimomuseum.ca/locations/nanaimo-museum/'], city: 'Nanaimo' },
  'remai-modern': { adapter: 'tribe-rest', endpoints: ['https://www.remaimodern.org/wp-json/tribe/events/v1/events'], city: 'Saskatoon' },
  'moncton-city': { adapter: 'moncton-calendar', city: 'Moncton' },
  'virl': { adapter: 'tribe-rest', endpoints: ['https://virl.bc.ca/wp-json/tribe/events/v1/events'] },
  'guelph-museums': { adapter: 'tribe-rest', endpoints: ['https://guelphmuseums.ca/wp-json/tribe/events/v1/events'] },
  'nlpl': { adapter: 'tribe-rest', endpoints: ['https://nlpl.ca/wp-json/tribe/events/v1/events'] },
  'kiac': { adapter: 'tribe-rest', endpoints: ['https://kiac.ca/wp-json/tribe/events/v1/events'] },
};

export function publisherRecord(source, cohort) {
  const ingest = { ...source.ingest, ...originalOverrides[source.id] };
  const url = publicUrl(source.url);
  if (!url || typeof source.id !== 'string' || !source.id || !source.publisher || !ingest.adapter) {
    throw new Error(`Invalid event source ${source.id ?? '(missing ID)'}.`);
  }
  const credentials = ['developer-key'];
  const approval = ['commercial-agreement', 'partner-agreement', 'organizer-approval'];
  const unsupported = ['toronto-ckan-recreation'];
  const status = credentials.includes(ingest.access) ? 'needs_credentials'
    : approval.includes(ingest.access) || /\.bibliocommons\.com$/.test(new URL(url).hostname)
      || source.id === 'has-things' || source.reuse?.status === 'needs_approval' ? 'needs_approval'
      : unsupported.includes(ingest.adapter) ? 'needs_adapter' : 'queued';
  const museum = source.id === 'nanaimo-museum' ? { name: 'Nanaimo Museum', city: 'Nanaimo', region: 'BC' } : null;
  const reason = status === 'needs_credentials' ? 'A developer key is required.'
    : status === 'needs_approval' ? ingest.conditions ?? 'Publisher approval or a reuse review is required.'
    : status === 'needs_adapter' ? 'This feed format requires an adapter.' : null;
  return {
    id: source.id, name: source.publisher, region: source.region, coverage: source.coverage,
    url, category: source.category, cohort, status, reason,
    config: {
      ingest, authority: source.authority ?? (['aggregator', 'tourism', 'ticketing'].includes(source.category) ? 1 : 2),
      ...((source.venue ?? museum) ? { venue: source.venue ?? museum } : {}),
      ...((source.venues ?? ingest.venues) ? { venues: source.venues ?? ingest.venues } : {}),
      ...(source.reuse ? { reuse: source.reuse } : {}),
    },
  };
}

export const registryRecords = [
  ...baseline.sources.map(source => publisherRecord(source, 'original')),
  ...expansion.sources.map(source => publisherRecord(source, 'additional')),
];

export async function seedRegistry(db) {
  if (new Set(registryRecords.map(source => source.id)).size !== registryRecords.length) {
    throw new Error('The event registry contains duplicate publisher IDs.');
  }
  await seedPublishers(db, registryRecords);
  await run(db, `UPDATE event_publishers SET status = 'retired', lease = NULL, lease_until = 0
    WHERE cohort IN ('original', 'additional') AND status != 'retired' AND id NOT IN (SELECT value FROM json_each(?))`,
  JSON.stringify(registryRecords.map(source => source.id)));
}
