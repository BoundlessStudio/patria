import { processDiscovery, queueDiscovery, refreshDiscovery } from './discovery.mjs';
import { seedRegistry } from './registry.mjs';
import { refreshDue } from './refresh.mjs';
import { listDue, nearbyInput, readNearby, sourceReport } from './store.mjs';

export const eventJson = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export async function nearbyEvents(params, env, ctx) {
  const input = nearbyInput(params);
  if (!input) return eventJson({ error: 'Choose a valid pin, distance, and date filter.' }, 400);
  const db = env.EVENTS_DB;
  if (!db) return eventJson({ error: 'The event index is temporarily unavailable.' }, 503);
  let data;
  try {
    data = await readNearby(db, input);
  } catch {
    return eventJson({ error: 'The event index is temporarily unavailable.' }, 503);
  }
  if (!ctx?.waitUntil) return eventJson({ ...data, refresh: data.partial ? 'partial' : 'ready' });
  try {
    const job = await queueDiscovery(db, input, data.events.length < 3);
    if (job?.state === 'queued' || job?.state === 'running') {
      ctx.waitUntil(processDiscovery(db, job.id, { env }).catch(() => {}));
    }
    const refresh = job?.state === 'queued' || job?.state === 'running' ? 'checking'
      : data.partial || job?.state === 'partial' ? 'partial' : 'ready';
    return eventJson({ ...data, refresh });
  } catch {
    return eventJson({ ...data, partial: true, refresh: 'partial' });
  }
}

const maintenanceTools = [
  {
    name: 'refresh_events', title: 'Refresh Patria calendars',
    description: 'Check a batch of due Canadian calendars and any queued discovery. Call until remainingDue is zero.',
    inputSchema: { type: 'object', properties: { verifyRepeat: { type: 'boolean' } }, additionalProperties: false },
  },
  {
    name: 'event_source_report', title: 'Patria publisher report',
    description: 'Read source status, coverage, and successful refresh counts for Patria’s event publishers.',
    inputSchema: { type: 'object', properties: { summary: { type: 'boolean' } }, additionalProperties: false },
  },
];

async function authorizedOperator(request, env, user) {
  if (env.PATRIA_EVENTS_OPERATOR_ID && user?.id === env.PATRIA_EVENTS_OPERATOR_ID) return true;
  const token = env.PATRIA_EVENTS_OPERATOR_TOKEN;
  const supplied = request.headers.get('X-Patria-Events-Token');
  if (!token || !supplied || supplied.length > 512) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([supplied, token].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const b = new Uint8Array(right);
  return new Uint8Array(left).reduce((diff, byte, index) => diff | (byte ^ b[index]), 0) === 0;
}

export async function handleEventMaintenance(request, env, user) {
  if (request.method !== 'POST') return eventJson({ error: 'Use POST for this endpoint.' }, 405);
  if (Number(request.headers.get('Content-Length')) > 16_384) return eventJson({ error: 'The request is too large.' }, 413);
  const body = await request.json().catch(() => null);
  if (!body || body.jsonrpc !== '2.0' || !Object.hasOwn(body, 'id')) return eventJson({ error: 'Invalid MCP request.' }, 400);
  const reply = (result, error) => eventJson({ jsonrpc: '2.0', id: body.id, ...(error ? { error } : { result }) });
  if (body.method === 'server/discover') return reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
  if (body.method === 'tools/list') return reply({ tools: maintenanceTools });
  if (body.method !== 'tools/call') return reply(null, { code: -32601, message: 'Unknown method.' });
  if (!(await authorizedOperator(request, env, user))) return reply(null, { code: -32001, message: 'Patria operator access required.' });
  const db = env.EVENTS_DB;
  if (!db) return reply(null, { code: -32002, message: 'Event database binding unavailable.' });
  let result;
  try {
    if (body.params?.name === 'refresh_events') {
      await seedRegistry(db);
      const signal = AbortSignal.timeout(23_000);
      const qualification = body.params.arguments?.verifyRepeat === true;
      const refreshed = await refreshDue(db, { env, signal, limit: 4, concurrent: true, qualification, force: qualification });
      const discovery = qualification ? null : await refreshDiscovery(db, { env, signal });
      const remaining = await listDue(db, { limit: 500, qualification });
      result = { refreshed, discovery, remainingDue: remaining.length };
    } else if (body.params?.name === 'event_source_report') {
      const { sources, ...summary } = await sourceReport(db);
      result = body.params.arguments?.summary ? summary : { ...summary, sources };
    } else return reply(null, { code: -32602, message: 'Unknown Patria tool.' });
  } catch {
    return reply(null, { code: -32002, message: 'The event maintenance request failed.' });
  }
  return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
}
