import { readFile } from 'node:fs/promises';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const googleHost = /(?:^|\.)(?:google(?:\.[a-z]{2,3}){1,2}|googleapis\.com|gstatic\.com|googleusercontent\.com|ggpht\.com|goo\.gl)$/i;
const apiRoot = 'https://api.worldlabs.ai/marble/v1/';

function sourceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || googleHost.test(url.hostname)) {
    throw new Error('Sources must be independent HTTPS references with rights for this use.');
  }
  return url.href;
}

function approvedMedia(source) {
  if (source.rightsReviewed !== true) throw new Error('Review the media rights before sending an image or video to Marble.');
  if (Boolean(source.mediaAssetId) === Boolean(source.mediaUrl)) {
    throw new Error('Specify one media URL or Marble media asset ID per media source.');
  }
  if (source.mediaAssetId) {
    if (!uuid.test(source.mediaAssetId)) throw new Error('Invalid Marble media asset ID.');
    return { source: 'media_asset', media_asset_id: source.mediaAssetId };
  }
  return { source: 'uri', uri: sourceUrl(source.mediaUrl) };
}

function generationRequest(manifest) {
  const { collection, target, displayName, prompt, sources } = manifest;
  if (!['walks', 'places'].includes(collection) || typeof target !== 'string' || !target.trim()
      || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 64
      || typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(sources) || !sources.length) {
    throw new Error('Set a walk or place target, name, scene prompt, and source credits in the manifest.');
  }
  for (const source of sources) {
    sourceUrl(source.url);
    if (!source.credit?.trim() || !source.license?.trim() || !['context', 'image', 'panorama', 'video'].includes(source.use)) {
      throw new Error('Each source needs a credit, license, and use.');
    }
  }

  const media = sources.filter(source => source.use !== 'context');
  const text_prompt = prompt.trim();
  let world_prompt = { type: 'text', text_prompt };
  if (media.length === 1) {
    const [source] = media;
    const content = approvedMedia(source);
    world_prompt = source.use === 'video'
      ? { type: 'video', video_prompt: content, text_prompt }
      : { type: 'image', image_prompt: content, is_pano: source.use === 'panorama', text_prompt };
  } else if (media.length > 1) {
    if (media.some(source => source.use !== 'image')) throw new Error('Use either multiple photos or one panorama or video.');
    const multi_image_prompt = media.map(source => {
      const view = { content: approvedMedia(source) };
      if (source.azimuth !== undefined) {
        if (!Number.isFinite(source.azimuth) || source.azimuth < 0 || source.azimuth >= 360) {
          throw new Error('Photo azimuth must be between 0 and 360 degrees.');
        }
        view.azimuth = source.azimuth;
      }
      return view;
    });
    world_prompt = { type: 'multi-image', multi_image_prompt, text_prompt };
  }
  return { display_name: displayName.trim(), model: 'marble-1.1', permission: { public: false }, world_prompt };
}

async function marble(path, body) {
  const apiKey = process.env.WLT_API_KEY?.trim();
  if (!apiKey) throw new Error('Set WLT_API_KEY in the local .env to contact World Labs.');
  const response = await fetch(new URL(path, apiRoot), {
    headers: { 'WLT-Api-Key': apiKey, 'Content-Type': 'application/json' },
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`World Labs returned HTTP ${response.status}.`);
  return response.json();
}

try {
  const [action, input, extra] = process.argv.slice(2);
  if (!input || extra || !['plan', 'submit', 'status'].includes(action)) {
    throw new Error('Usage: generate-marble.mjs <plan|submit> <manifest.json> or generate-marble.mjs status <operation-id>');
  }
  if (action === 'status') {
    if (!uuid.test(input)) throw new Error('Enter a valid World Labs operation ID.');
    const result = await marble('operations/' + input);
    if (result.error) throw new Error(`World Labs reported a failed generation (${result.error.code}).`);
    const worldId = result.response?.id ?? result.metadata?.world_id;
    console.log(JSON.stringify({
      operationId: input, done: result.done, progress: result.metadata?.progress?.status,
      ...(result.done && uuid.test(worldId) ? { worldId, url: 'https://marble.worldlabs.ai/world/' + worldId } : {}),
    }, null, 2));
  } else {
    const manifest = JSON.parse(await readFile(input, 'utf8'));
    const request = generationRequest(manifest);
    if (action === 'plan') {
      console.log(JSON.stringify({ collection: manifest.collection, target: manifest.target, request }, null, 2));
    } else {
      const result = await marble('worlds:generate', request);
      if (!uuid.test(result.operation_id)) throw new Error('World Labs returned no valid operation ID. Check the dashboard for the request.');
      console.log(JSON.stringify({ operationId: result.operation_id, collection: manifest.collection, target: manifest.target }, null, 2));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
