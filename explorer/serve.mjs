import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleApi, requireUserRoute } from './worker/api.mjs';
const root = fileURLToPath(new URL('./public/', import.meta.url)).replace(/[\\/]$/, '');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain', '.json': 'application/json' };
http.createServer(async (req, res) => {
  try {
    const headers=new Headers(req.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-'))headers.delete(key);
    const request=new Request(new URL(req.url,'http://127.0.0.1:4173'), { method:req.method,headers });
    const api = await handleApi(request, { ...process.env,PATRIA_LOCAL:'true' });
    if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(Buffer.from(await api.arrayBuffer()));return;}
    const gate=requireUserRoute(request);if(gate){res.writeHead(302,{Location:gate.headers.get('Location')});res.end();return;}
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(pathname==='/signin-with-chatgpt'){res.writeHead(302,{Location:'/?signin=local'});res.end();return;}
    const route=['/','/preview','/explore','/onboarding'].includes(pathname)?'/index.html':pathname==='/setup'?'/setup.html':pathname==='/privacy'?'/privacy.html':pathname==='/terms'?'/terms.html':pathname;
    const file = path.resolve(root, '.' + route);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Patria preview: http://127.0.0.1:4173'));
