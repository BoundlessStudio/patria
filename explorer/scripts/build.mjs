import { readdir, readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const publicRoot=path.join(root,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};
const assets={};
async function pack(folder,prefix=''){for(const entry of await readdir(folder,{withFileTypes:true})){const rel=path.posix.join(prefix,entry.name),file=path.join(folder,entry.name);if(entry.isDirectory())await pack(file,rel);else assets['/'+rel]={type:mime[path.extname(file)]||'application/octet-stream',body:(await readFile(file)).toString('base64')};}}
await pack(publicRoot);
const aliases = {};
for (const asset of Object.values(assets).filter(item => item.type.startsWith('text/html'))) {
  const html = Buffer.from(asset.body, 'base64').toString('utf8');
  const updated = html.replace(/\b(src|href)="([\w.-]+\.(?:js|css))"/g, (match, attr, name) => {
    const original = `/${name}`;
    if (!assets[original]) return match;
    const hash = createHash('sha256').update(assets[original].body).digest('hex').slice(0, 16);
    const url = `/_static/${hash}/${name}`;
    aliases[url] = original;
    return `${attr}="${url}"`;
  });
  asset.body = Buffer.from(updated).toString('base64');
}
const worker = `import { handleApi, requireUserRoute } from './worker/api.mjs';
const packedAssets = ${JSON.stringify(assets)};
const versionedAssets = ${JSON.stringify(aliases)};
const pages = { '/': '/index.html', '/explore': '/index.html', '/onboarding': '/index.html', '/preview': '/index.html',
  '/setup': '/setup.html', '/privacy': '/privacy.html', '/terms': '/terms.html' };
export default { async fetch(request, env, ctx) {
  const api = await handleApi(request, env, ctx);
  if (api) return api;
  const gate = requireUserRoute(request);
  if (gate) return gate;
  const { pathname } = new URL(request.url);
  const versioned = versionedAssets[pathname];
  const asset = packedAssets[versioned ?? pages[pathname] ?? pathname];
  if (!asset) return new Response('Not found', { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), char => char.charCodeAt(0));
  return new Response(body, { headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': versioned ? 'public,max-age=31536000,immutable' : pathname.startsWith('/assets/') ? 'public,max-age=86400' : 'no-cache',
  } });
} };
`;
await mkdir(path.join(root,'dist/server'),{recursive:true});await mkdir(path.join(root,'dist/.openai'),{recursive:true});
await build({
  stdin: { contents: worker, resolveDir: root, sourcefile: 'patria-worker.mjs' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  outfile: path.join(root, 'dist/server/index.js'),
});
await writeFile(path.join(root,'dist/.openai/hosting.json'),await readFile(path.join(root,'.openai/hosting.json')));
await cp(path.join(root, 'drizzle'), path.join(root, 'dist/.openai/drizzle'), { recursive: true });
const module=await import(new URL('../dist/server/index.js',import.meta.url));if(typeof module.default?.fetch!=='function')throw new Error('Worker fetch export is missing.');
const response = await module.default.fetch(new Request('http://localhost/'), {}, {});
const html = await response.text();
if (response.status !== 200 || !html.includes('Patria')) throw new Error('Built page did not render.');
const script = html.match(/src="(\/_static\/[^/]+\/app\.js)"/)?.[1];
if (!script || !(await module.default.fetch(new Request('http://localhost' + script), {}, {})).ok) {
  throw new Error('The built explorer script is missing its versioned URL.');
}
console.log(`Built and verified Patria Worker with ${Object.keys(assets).length} embedded public assets.`);
