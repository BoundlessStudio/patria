import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi,getUser,requireUserRoute} from './api.mjs';

let sequence=0;
function request(path,{user=true,headers={},method='GET'}={}){
  return new Request('https://patria.test'+path,{method,headers:{...(user?{'oai-authenticated-user-id':'user-1','oai-authenticated-user-email':'reader@example.test'}:{}),'CF-Connecting-IP':'test-'+(++sequence),...headers}});
}
async function call(path,options={},config={}){const response=await handleApi(request(path,options),config);return {response,data:await response.json()};}

test('the public session is never cached',async()=>{
  const {response,data}=await call('/api/session',{user:false},{PATRIA_LOCAL:'true'});
  assert.deepEqual(data,{user:null,hosted:false});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('place endpoints require platform identity',async()=>{
  for(const path of ['/api/search?q=Toronto','/api/nearby?lat=43&lng=-79'])assert.equal((await call(path,{user:false})).response.status,401);
});
test('protected pages redirect to platform sign-in with a local return path',()=>{
  const response=requireUserRoute(request('/onboarding?step=1',{user:false}));
  assert.equal(response.status,302);
  const location=new URL(response.headers.get('Location'));
  assert.equal(location.origin,'https://patria.test');
  assert.equal(location.searchParams.get('return_to'),'/onboarding?step=1');
  assert.equal(requireUserRoute(request('/explore')),null);
  assert.equal(requireUserRoute(request('/',{user:false})),null);
});
test('platform display name decoding handles malformed input',()=>{
  assert.equal(getUser(request('/',{headers:{'oai-authenticated-user-full-name':'Jamie%20Lee','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'}})).name,'Jamie Lee');
  assert.equal(getUser(request('/',{headers:{'oai-authenticated-user-full-name':'%invalid','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'}})).name,'reader@example.test');
});
test('request method, origin, and input validation block malformed requests',async()=>{
  assert.equal((await call('/api/search?q=Toronto',{method:'POST'})).response.status,405);
  assert.equal((await call('/api/search?q=Toronto',{headers:{Origin:'https://unrelated.test'}})).response.status,403);
  for(const path of ['/api/search?q=','/api/search?q='+('x'.repeat(181)),'/api/nearby?lat=&lng=-79','/api/nearby?lat=91&lng=0','/api/nearby?lat=0&lng=Infinity','/api/nearby?lat=43x&lng=-79','/api/nearby?lat=43&lng=-79&category=__proto__'])assert.equal((await call(path)).response.status,400,path);
  assert.equal((await call('/api/unknown')).response.status,404);
});
test('search uses Photon without an API key and handles unnamed addresses',async(t)=>{
  let upstream;
  t.mock.method(globalThis,'fetch',async(url)=>{
    upstream=url;
    return Response.json({features:[
      {properties:{name:'Toronto',state:'Ontario'},geometry:{type:'Point',coordinates:[-79,43]}},
      {properties:{housenumber:'123',street:'Queen Street West',city:'Toronto'},geometry:{type:'Point',coordinates:[-79.1,43.2]}},
      {properties:{name:'Without coordinates'}},
    ]});
  });
  const {data}=await call('/api/search?q=Toronto');
  assert.equal(upstream.origin,'https://photon.komoot.io');
  assert.equal(upstream.pathname,'/api/');
  assert.deepEqual(Object.fromEntries(upstream.searchParams),{q:'Toronto',limit:'5'});
  assert.equal(data.provider,'osm');
  assert.deepEqual(data.locations,[
    {name:'Toronto',address:'Ontario',lat:43,lng:-79},
    {name:'123 Queen Street West',address:'123 Queen Street West, Toronto',lat:43.2,lng:-79.1},
  ]);
});
test('nearby search bounds the radius and keeps stable OSM IDs and source links',async(t)=>{
  let upstream;
  const cafe={properties:{osm_type:'N',osm_id:123,osm_key:'amenity',osm_value:'cafe',name:'A Café'},geometry:{type:'Point',coordinates:[-79.2,43.5]}};
  const park={...cafe,properties:{osm_type:'W',osm_id:123,osm_key:'leisure',osm_value:'park',name:'A Park'}};
  t.mock.method(globalThis,'fetch',async(url)=>{upstream=url;return Response.json({features:[cafe,cafe,park]});});
  const {data}=await call('/api/nearby?lat=43.5&lng=-79.2&category=coffee');
  assert.equal(upstream.pathname,'/reverse/');
  assert.deepEqual(Object.fromEntries(upstream.searchParams),{
    lat:'43.5',lon:'-79.2',radius:'1.2',limit:'20',include:'osm.amenity.cafe,osm.shop.coffee',
  });
  assert.deepEqual(data.places,[{
    id:'osm:node:123',provider:'osm',category:'coffee',name:'A Café',address:'',lat:43.5,lng:-79.2,
    source:'https://www.openstreetmap.org/node/123',sourceLabel:'OpenStreetMap',
  }]);
  const all = await call('/api/nearby?lat=43.5&lng=-79.2');
  assert.deepEqual(all.data.places.map(place=>place.id),['osm:node:123','osm:way:123']);
});
test('a configured Photon origin can replace the public instance',async(t)=>{
  let upstream;
  t.mock.method(globalThis,'fetch',async(url)=>{upstream=url;return Response.json({features:[]});});
  const {data}=await call('/api/search?q=Toronto',{}, {PATRIA_PHOTON_URL:'https://photon.example.test'});
  assert.equal(upstream.origin,'https://photon.example.test');
  assert.deepEqual(data.locations,[]);
});
test('upstream errors return a readable message without exposing response details',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('upstream detail',{status:403}));
  const {response,data}=await call('/api/search?q=Toronto');
  assert.equal(response.status,502);
  assert.match(data.error,/OpenStreetMap/);
  assert.doesNotMatch(data.error,/upstream detail/);
});
test('per-IP request limit prevents excessive lookups',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({features:[]}));
  const headers={'CF-Connecting-IP':'rate-limit-test'};
  for(let i=0;i<30;i++)assert.equal((await call('/api/search?q=Toronto',{headers})).response.status,200);
  assert.equal((await call('/api/search?q=Toronto',{headers})).response.status,429);
});
test('a walk needs two valid, distinct neighborhood points', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected upstream call'); });
  for (const query of ['', '?from=-79,43&to=,43', '?from=-79,43&to=-79,43', '?from=-79,43&to=-79,44']) {
    assert.equal((await call('/api/walk' + query, { user: false })).response.status, 400);
  }
  assert.equal(upstream.mock.callCount(), 0);
});
test('the public walk preview uses bounded foot routing and handles unavailable paths', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const geometry = { type: 'LineString', coordinates: [[-79.4015, 43.6547], [-79.4002, 43.6537]] };
  let noRoute = false;
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://routing.openstreetmap.de');
    assert.match(url.pathname, /^\/routed-foot\/route\/v1\/driving\//);
    assert.equal(url.searchParams.get('geometries'), 'geojson');
    assert.equal(url.searchParams.get('radiuses'), '100;100');
    assert.match(options.headers['User-Agent'], /Patria/);
    return noRoute ? Response.json({ code: 'NoRoute' }, { status: 400 })
      : Response.json({ code: 'Ok', routes: [{ geometry, distance: 208.8, duration: 167.1 }] });
  });
  const query = '/api/walk?from=-79.4015,43.6547&to=-79.4002,43.6537';
  const other = '/api/walk?from=-79.4015,43.6547&to=-79.4007,43.6542';
  const preview = { user: false };
  const first = await call(query, preview);
  assert.equal(first.response.status, 200);
  assert.deepEqual(first.data, { geometry, distance: 208.8, duration: 167.1 });
  assert.equal((await call(query, preview)).response.status, 200);
  assert.equal((await call(other, preview)).response.status, 429);
  assert.equal(upstream.mock.callCount(), 1);
  now += 1200;
  noRoute = true;
  assert.equal((await call(other, preview)).response.status, 422);
  assert.equal(upstream.mock.callCount(), 2);
});
