const placeTags = {
  coffee: ['amenity.cafe', 'shop.coffee'],
  food: ['amenity.restaurant', 'amenity.fast_food', 'shop.bakery'],
  parks: ['leisure.park', 'leisure.garden', 'leisure.nature_reserve'],
  culture: ['tourism.gallery', 'tourism.museum', 'tourism.attraction', 'amenity.arts_centre', 'amenity.theatre'],
  shops: ['shop.books', 'shop.clothes', 'shop.gift', 'shop.antiques', 'shop.second_hand', 'shop.convenience', 'shop.supermarket'],
};
const categoryByTag = new Map(Object.entries(placeTags).flatMap(([category, tags]) =>
  tags.map(tag => [tag, category])
));
const osmTypes = { N: 'node', W: 'way', R: 'relation' };
const counters=new Map();
const walkingRoutes = new Map();
let nextRouteRequest = 0;
function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function walkingPoint(value) {
  const parts = value?.split(',').map(part => part.trim());
  if (parts?.length !== 2 || parts.some(part => !part)) return null;
  const [lng, lat] = parts.map(Number);
  if (!validCoordinates(lat, lng) || Math.abs(lat) > 85) return null;
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}
function separation([lngA, latA], [lngB, latB]) {
  const radians = Math.PI / 180;
  const a = Math.sin((latB - latA) * radians / 2) ** 2
    + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin((lngB - lngA) * radians / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
async function walkingRoute(params, env) {
  const from = walkingPoint(params.get('from'));
  const to = walkingPoint(params.get('to'));
  if (!from || !to) return json({ error: 'Choose a start and a destination on the map.' }, 400);
  const distance = separation(from, to);
  if (distance < 3 || distance > 5000) {
    return json({ error: 'Choose two different points within 5 km of each other.' }, 400);
  }

  const router = (env.PATRIA_WALK_ROUTER_URL || 'https://routing.openstreetmap.de/routed-foot/').replace(/\/$/, '');
  const endpoint = new URL(router + '/route/v1/driving/' + from.join(',') + ';' + to.join(','));
  endpoint.search = new URLSearchParams({
    overview: 'full', geometries: 'geojson', radiuses: '100;100', generate_hints: 'false',
  });
  const key = endpoint.href;
  const now = Date.now();
  const cached = walkingRoutes.get(key);
  if (cached?.expires > now) return json(cached.data);
  if (now < nextRouteRequest) {
    return json({ error: 'The route service is busy. Wait a moment and try again.' }, 429);
  }
  nextRouteRequest = now + 1100;

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Patria/1.0 (+https://patria.rgbknights.com)',
      Referer: 'https://patria.rgbknights.com/',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 429) return json({ error: 'The route service is busy. Try again shortly.' }, 429);
  if (response.status >= 500) throw new Error('Routing service unavailable.');
  const result = await response.json();
  if (result.code === 'NoRoute' || result.code === 'NoSegment') {
    return json({ error: 'No walking route was found. Try moving the points closer to mapped streets or paths.' }, 422);
  }
  const route = result.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!response.ok || result.code !== 'Ok' || route?.geometry?.type !== 'LineString'
      || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 6000
      || !coordinates.every(point => Array.isArray(point) && point.length === 2 && validCoordinates(point[1], point[0]))
      || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new Error('Invalid walking route.');
  }
  if (route.distance < 3 || route.distance > 10000) {
    return json({ error: 'This route is too short or too long for a neighborhood preview. Try different points.' }, 422);
  }
  const data = { geometry: route.geometry, distance: route.distance, duration: route.duration };
  if (walkingRoutes.size >= 100) walkingRoutes.delete(walkingRoutes.keys().next().value);
  walkingRoutes.set(key, { data, expires: now + 600000 });
  return json(data);
}
function locationFromFeature(feature) {
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates) || !feature.properties) return null;
  const [lng, lat] = feature.geometry.coordinates;
  if (!validCoordinates(lat, lng)) return null;
  const p = feature.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [...new Set([street, p.city, p.state, p.country].filter(Boolean))].join(', ');
  return { name: p.name || street || address, address, lat, lng };
}
function placeFromFeature(feature) {
  const location = locationFromFeature(feature);
  if (!location || !feature.properties.name) return null;
  const p = feature.properties;
  const type = osmTypes[p.osm_type];
  const category = categoryByTag.get(p.osm_key + '.' + p.osm_value);
  if (!type || !Number.isSafeInteger(p.osm_id) || p.osm_id <= 0 || !category) return null;
  return {
    ...location,
    id: `osm:${type}:${p.osm_id}`,
    provider: 'osm',
    category,
    source: `https://www.openstreetmap.org/${type}/${p.osm_id}`,
    sourceLabel: 'OpenStreetMap',
  };
}
async function photonFeatures(env, path, params) {
  const url = new URL(path, env.PATRIA_PHOTON_URL || 'https://photon.komoot.io');
  url.search = new URLSearchParams(params);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Photon request failed.');
  const { features } = await response.json();
  if (!Array.isArray(features)) throw new Error('Invalid Photon response.');
  return features;
}
function rateAllowed(request){const ip=request.headers.get('CF-Connecting-IP')||'local';const window=Math.floor(Date.now()/60000);if(counters.size>5000)counters.clear();let c=counters.get(ip);if(!c||c.window!==window){c={window,count:0};counters.set(ip,c);}return ++c.count<=30;}
// Identity headers are supplied and verified by Sites dispatch, never by browser input.
export function getUser(request){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');if(!id||!email)return null;let name=email;const value=request.headers.get('oai-authenticated-user-full-name');if(value&&request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(value);}catch{}}return {id,name};}
export function requireUserRoute(request){const u=new URL(request.url);if(['/onboarding','/explore'].includes(u.pathname)&&!getUser(request))return Response.redirect(new URL('/signin-with-chatgpt?return_to='+encodeURIComponent(u.pathname+u.search),u.origin),302);return null;}
export async function handleApi(request,env={}){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return null;
 if(request.method!=='GET')return json({error:'Use GET for this endpoint.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Use Patria to access this service.'},403);
 if(url.pathname==='/api/session')return json({user:getUser(request),hosted:env.PATRIA_LOCAL!=='true'});
 if (url.pathname === '/api/walk') {
   if (!rateAllowed(request)) return json({ error: 'Too many route requests. Try again in a minute.' }, 429);
   try {
     return await walkingRoute(url.searchParams, env);
   } catch {
     return json({ error: 'Walking routes are temporarily unavailable. Try again shortly.' }, 502);
   }
 }
 if(!['/api/search','/api/nearby'].includes(url.pathname))return json({error:'Not found.'},404);
 if(!getUser(request))return json({error:'Sign in to explore any neighborhood.'},401);
 if(!rateAllowed(request))return json({error:'A few too many searches. Please wait a minute and try again.'},429);
 try {
   if (url.pathname === '/api/search') {
     const q = url.searchParams.get('q')?.trim();
     if (!q || q.length > 180) return json({error:'Enter a city, neighborhood, or address (up to 180 characters).'}, 400);
     const features = await photonFeatures(env, '/api/', { q, limit: 5 });
     const locations = features.map(locationFromFeature).filter(location => location?.name);
     return json({ locations, provider: 'osm' });
   }

   const latitude = url.searchParams.get('lat')?.trim();
   const longitude = url.searchParams.get('lng')?.trim();
   const lat = Number(latitude);
   const lng = Number(longitude);
   if (!latitude || !longitude || !validCoordinates(lat, lng)) {
     return json({error:'Choose a valid location on the map.'}, 400);
   }
   const category = url.searchParams.get('category') || 'all';
   if (category !== 'all' && !Object.hasOwn(placeTags, category)) {
     return json({error:'Choose a valid place interest.'}, 400);
   }
   const tags = category === 'all' ? [...categoryByTag.keys()] : placeTags[category];
   const features = await photonFeatures(env, '/reverse/', {
     lat, lon: lng, radius: 1.2, limit: 20,
     include: tags.map(tag => 'osm.' + tag).join(','),
   });
   const places = new Map();
   for (const feature of features) {
     const place = placeFromFeature(feature);
     if (place && (category === 'all' || place.category === category) && !places.has(place.id)) {
       places.set(place.id, place);
     }
   }
   return json({ places: [...places.values()], provider: 'osm' });
 } catch {
   return json({error:'OpenStreetMap place discovery is temporarily unavailable. Please try again shortly.'}, 502);
 }
}
