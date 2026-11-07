import { parseArgs } from 'node:util';
import { openLocalEvents } from './local-events.mjs';
import { seedRegistry } from '../worker/events/registry.mjs';
import { refreshPublisher } from '../worker/events/refresh.mjs';
import { processDiscovery, queueDiscovery } from '../worker/events/discovery.mjs';
import { listDue, nearbyInput, readNearby, sourceReport } from '../worker/events/store.mjs';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const { positionals: [command], values } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' }, cohort: { type: 'string' }, limit: { type: 'string' }, force: { type: 'boolean' },
    lat: { type: 'string' }, lng: { type: 'string' }, radius: { type: 'string' }, window: { type: 'string' },
  },
});
const db = openLocalEvents();
const env = { ...process.env, PATRIA_LOCAL: 'true' };

try {
  if (command === 'seed') {
    await seedRegistry(db);
    console.log(`Seeded ${(await sourceReport(db)).total} event publishers.`);
  } else if (command === 'refresh') {
    await seedRegistry(db);
    const limit = Number(values.limit ?? '250');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use a limit between 1 and 1,000.');
    const due = await listDue(db, { source: values.source, cohort: values.cohort, force: values.force, limit });
    // The same HTTP origin may serve many publishers, so each refresh batch stays small.
    for (let index = 0; index < due.length; index += 5) {
      const batch = due.slice(index, index + 5);
      const results = await Promise.all(batch.map(({ id }) => refreshPublisher(db, id, { env, force: values.force })));
      for (const result of results) console.log(JSON.stringify(result));
    }
  } else if (command === 'report') {
    console.log(JSON.stringify(await sourceReport(db), null, 2));
  } else if (command === 'nearby' || command === 'discover') {
    const input = nearbyInput(new URLSearchParams(Object.entries(values)));
    if (!input) throw new Error('Provide valid --lat and --lng, with an optional --radius and --window.');
    if (command === 'discover') {
      await seedRegistry(db);
      const job = await queueDiscovery(db, input, true);
      console.log(JSON.stringify(await processDiscovery(db, job.id, { env, signal: AbortSignal.timeout(60_000) }), null, 2));
    } else console.log(JSON.stringify(await readNearby(db, input), null, 2));
  } else {
    throw new Error('Choose seed, refresh, report, discover or nearby.');
  }
} finally {
  db.close();
}
