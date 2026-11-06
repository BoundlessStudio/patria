import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const publicRoot=path.join(root,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};
const assets={};
async function pack(folder,prefix=''){for(const entry of await readdir(folder,{withFileTypes:true})){const rel=path.posix.join(prefix,entry.name),file=path.join(folder,entry.name);if(entry.isDirectory())await pack(file,rel);else assets['/'+rel]={type:mime[path.extname(file)]||'application/octet-stream',body:(await readFile(file)).toString('base64')};}}
await pack(publicRoot);
const api=await readFile(path.join(root,'worker/api.mjs'),'utf8');
const worker=`${api}\nconst packedAssets=${JSON.stringify(assets)};\nexport default {async fetch(request,env,ctx){const api=await handleApi(request,env);if(api)return api;const gate=requireUserRoute(request);if(gate)return gate;const url=new URL(request.url);const route=['/','/explore','/onboarding','/preview'].includes(url.pathname)?'/index.html':url.pathname==='/setup'?'/setup.html':url.pathname==='/privacy'?'/privacy.html':url.pathname==='/terms'?'/terms.html':url.pathname;const asset=packedAssets[route];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const body=request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':url.pathname.startsWith('/assets/')?'public,max-age=86400':'no-cache'}});}};\n`;
await mkdir(path.join(root,'dist/server'),{recursive:true});await mkdir(path.join(root,'dist/.openai'),{recursive:true});
await writeFile(path.join(root,'dist/server/index.js'),worker);
await writeFile(path.join(root,'dist/.openai/hosting.json'),await readFile(path.join(root,'.openai/hosting.json')));
const module=await import(new URL('../dist/server/index.js',import.meta.url));if(typeof module.default?.fetch!=='function')throw new Error('Worker fetch export is missing.');
const response=await module.default.fetch(new Request('http://localhost/'),{},{});if(response.status!==200||!(await response.text()).includes('Patria'))throw new Error('Built page did not render.');
console.log(`Built and verified Patria Worker with ${Object.keys(assets).length} embedded public assets.`);
