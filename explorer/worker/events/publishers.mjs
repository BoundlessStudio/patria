import robotsParser from 'robots-parser';
import { parseDocument } from 'htmlparser2';
import { textContent } from 'domutils';

const userAgent = 'Patria/1.0 (+https://patria.rgbknights.com)';
const robotRules = new Map();
const payloadLimit = 4 * 1024 * 1024;

export class PublisherIssue extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function publicUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.replace(/^webcal:/i, 'https:'), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
      || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

async function boundedText(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Publisher response is too large.');
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Publisher response is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function allowedByRobots(url, fetcher, signal) {
  const robotsUrl = new URL('/robots.txt', url).href;
  const cached = robotRules.get(robotsUrl);
  if (cached && cached.expires > Date.now()) return (await cached.rules)?.isAllowed(url, 'Patria') !== false;
  if (robotRules.size >= 256) robotRules.delete(robotRules.keys().next().value);
  const entry = {
    expires: Date.now() + 12 * 3_600_000,
    rules: (async () => {
      const response = await fetcher(robotsUrl, { headers: { 'User-Agent': userAgent }, signal, redirect: 'manual' });
      if (response.status === 429 || response.status >= 500) throw new Error(`Publisher robots.txt returned HTTP ${response.status}.`);
      if (!response.ok) return null;
      return robotsParser(robotsUrl, await boundedText(response, 256 * 1024));
    })(),
  };
  robotRules.set(robotsUrl, entry);
  try {
    return (await entry.rules)?.isAllowed(url, 'Patria') !== false;
  } catch (error) {
    robotRules.delete(robotsUrl);
    throw error;
  }
}

export async function fetchPublished(value, { fetcher = fetch, signal, accept = '*/*', form } = {}) {
  const timeout = AbortSignal.timeout(10_000);
  const deadline = signal ? AbortSignal.any([timeout, signal]) : timeout;
  let url = publicUrl(value);
  for (let redirects = 0; redirects < 4 && url; redirects++) {
    if (!(await allowedByRobots(url, fetcher, deadline))) {
      throw new PublisherIssue('needs_approval', 'Publisher robots.txt disallows this endpoint.');
    }
    const response = await fetcher(url, {
      headers: { Accept: accept, 'User-Agent': userAgent }, redirect: 'manual', signal: deadline,
      ...(form ? { method: 'POST', body: form } : {}),
    });
    if (response.status >= 300 && response.status < 400) {
      if (form) throw new Error('Publisher redirected the calendar request.');
      url = publicUrl(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}.`);
    return { url, contentType: response.headers.get('content-type') ?? '', text: await boundedText(response, payloadLimit) };
  }
  throw new Error('Invalid publisher URL or redirect.');
}

export function plain(value) {
  const text = typeof value === 'string' ? value : '';
  const decoded = /[<&]/.test(text) ? textContent(parseDocument(text)) : text;
  return decoded.replace(/\s+/g, ' ').trim();
}
