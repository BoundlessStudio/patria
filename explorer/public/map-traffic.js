const trafficZoom = 17;
const trafficSource = 'openmaptiles';
const roadTraffic = {
  motorway: [3300, 95],
  trunk: [2300, 78],
  primary: [1300, 54],
  secondary: [830, 48],
  tertiary: [470, 42],
  minor: [160, 33],
  service: [65, 19],
};
const trafficFeeds = [
  { id: 'toronto', label: 'Toronto', bounds: [-79.67, 43.56, -79.10, 43.87] },
  { id: 'calgary', label: 'Calgary', bounds: [-114.4, 50.8, -113.77, 51.24] },
  { id: 'quebec', label: 'Québec', bounds: [-76.15, 45.24, -70.87, 47.05] },
];
const carPaint = [
  [.87, .85, .79], [.73, .78, .79], [.31, .44, .56], [.66, .31, .25],
  [.36, .48, .4], [.75, .6, .36], [.34, .37, .41], [.79, .72, .62],
];
const trainPaint = [.26, .51, .39];
const ferryPaint = [.25, .45, .58];

function trafficHash(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function trafficStreetName(value) {
  return (value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[.'-]/g, ' ').replace(/\b(street|avenue|road|drive|boulevard|court|trail|crescent)\b/g, word =>
      ({ street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', court: 'crt', trail: 'trl', crescent: 'cres' })[word]
    ).replace(/\b(north|south|east|west)\b/g, word => word[0]).replace(/\s+/g, ' ').trim();
}

function trafficPath(coordinates) {
  const points = coordinates.map(coordinate => maplibregl.MercatorCoordinate.fromLngLat(coordinate));
  const scale = points[0].meterInMercatorCoordinateUnits();
  const segments = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const east = b.x - a.x, south = b.y - a.y;
    const extent = Math.hypot(east, south);
    const metres = extent / scale;
    if (metres < .3) continue;
    const bearing = Math.atan2(east, -south) * 180 / Math.PI;
    segments.push({ a, east, south, bearing, extent, metres, start: length });
    length += metres;
  }
  return { length, scale, segments };
}

function nearestOnTrafficPath(path, position) {
  let nearest = { distance: Infinity, along: 0, bearing: 0 };
  for (const segment of path.segments) {
    const { a, east, south, extent, start, metres, bearing } = segment;
    const fraction = Math.max(0, Math.min(1, ((position.x - a.x) * east + (position.y - a.y) * south) / (extent * extent)));
    const distance = Math.hypot(position.x - a.x - east * fraction, position.y - a.y - south * fraction) / path.scale;
    if (distance < nearest.distance) nearest = { distance, along: start + fraction * metres, bearing };
  }
  return nearest;
}

function trafficPose(path, distance, direction, lane) {
  const along = direction > 0 ? distance : path.length - distance;
  const segment = path.segments.find(s => along <= s.start + s.metres) || path.segments.at(-1);
  const { a, east, south, extent, start, metres, bearing } = segment;
  const fraction = Math.max(0, Math.min(1, (along - start) / metres));
  const offset = lane * direction * path.scale / extent;
  return {
    location: new maplibregl.MercatorCoordinate(
      a.x + east * fraction - south * offset,
      a.y + south * fraction + east * offset,
      .024 * path.scale,
    ),
    bearing: bearing + (direction < 0 ? 180 : 0),
  };
}

function trafficWindow(map) {
  const bounds = map.getBounds(), center = map.getCenter().wrap();
  const marginLat = .0026, marginLng = marginLat / Math.max(.2, Math.cos(center.lat * Math.PI / 180));
  return [
    Math.max(center.lng - .065, Math.min(bounds.getWest(), center.lng) - marginLng),
    Math.max(center.lat - .041, Math.min(bounds.getSouth(), center.lat) - marginLat),
    Math.min(center.lng + .065, Math.max(bounds.getEast(), center.lng) + marginLng),
    Math.min(center.lat + .041, Math.max(bounds.getNorth(), center.lat) + marginLat),
  ];
}

function trafficIntersects(a, b) {
  return a[0] <= b[2] && a[1] <= b[3] && a[2] >= b[0] && a[3] >= b[1];
}

function vehicleKind(properties) {
  const type = properties.class;
  if (properties.brunnel === 'tunnel' || Number(properties.layer) < 0 || properties.subclass === 'subway') return null;
  if (Object.hasOwn(roadTraffic, type) && !['private', 'no'].includes(properties.access)
      && properties.service !== 'parking_aisle') return 'car';
  if (type === 'ferry') return 'ferry';
  if (['tram', 'light_rail'].includes(properties.subclass)) return 'tram';
  if (type === 'rail' && !properties.service) return 'train';
  return null;
}

function visibleTrafficPaths(map, window, center) {
  const names = new Map(map.querySourceFeatures(trafficSource, { sourceLayer: 'transportation_name' })
    .filter(feature => feature.id != null && feature.properties.name)
    .map(feature => [feature.id, trafficStreetName(feature.properties.name)]));
  const paths = new Map();
  for (const feature of map.querySourceFeatures(trafficSource, { sourceLayer: 'transportation' })) {
    const { geometry, properties } = feature;
    const kind = vehicleKind(properties);
    if (!kind || !['LineString', 'MultiLineString'].includes(geometry.type)) continue;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    for (const line of lines) {
      if (line.length < 2) continue;
      const bounds = line.reduce(([w, s, e, n], [lng, lat]) =>
        [Math.min(w, lng), Math.min(s, lat), Math.max(e, lng), Math.max(n, lat)],
      [Infinity, Infinity, -Infinity, -Infinity]);
      if (!trafficIntersects(bounds, window)) continue;
      const endpoints = [line[0], line.at(-1)].map(point => point.map(value => value.toFixed(5)).join(',')).sort();
      const key = [kind, feature.id, ...endpoints].join(':');
      if (paths.has(key)) continue;
      const path = trafficPath(line);
      if (path.length < ({ car: 18, tram: 30, train: 55, ferry: 85 })[kind]) continue;
      const near = nearestOnTrafficPath(path, center);
      paths.set(key, { ...path, key, kind, bounds, near, properties, name: names.get(feature.id) });
    }
  }
  return [...paths.values()].sort((a, b) => a.near.distance - b.near.distance);
}

function applyTrafficCounts(roads, samples, window) {
  for (const sample of samples) {
    const [lng, lat, daily, speed, bearing, street] = sample;
    if (!trafficIntersects([lng, lat, lng, lat], window)) continue;
    const position = maplibregl.MercatorCoordinate.fromLngLat([lng, lat]);
    const name = trafficStreetName(street);
    let best, score = Infinity;
    for (const road of roads) {
      if (!trafficIntersects(road.bounds, [lng - .001, lat - .0006, lng + .001, lat + .0006])) continue;
      if (name && road.name && name !== road.name) continue;
      if (daily > 30000 && ['minor', 'service'].includes(road.properties.class)) continue;
      const nearest = nearestOnTrafficPath(road, position);
      const sameName = name && name === road.name;
      const difference = bearing === null ? 0 : Math.abs(((nearest.bearing - bearing + 450) % 180) - 90);
      if (difference > 38 || nearest.distance > (sameName ? 48 : bearing === null ? 15 : 31)) continue;
      const candidate = nearest.distance + difference / 4 - (sameName ? 18 : 0);
      if (candidate < score) {
        best = road;
        score = candidate;
      }
    }
    if (best && (!best.observed || score < best.observed.score)) best.observed = { daily, speed, score };
  }
}

function streetVehicles(paths, origins, time, draw, limit) {
  let drawn = 0;
  for (const path of paths) {
    const seed = trafficHash(path.key);
    if (path.kind !== 'car') {
      const speed = path.kind === 'ferry' ? 5.6 : path.kind === 'train' ? 14 : 8.2;
      if (!origins.has(path.key)) origins.set(path.key, { time, offset: Math.max(9, path.near.along) });
      const origin = origins.get(path.key);
      const distance = (origin.offset + (time - origin.time) * speed) % path.length;
      const cars = path.kind === 'train' ? Math.min(3, Math.floor(path.length / 33)) : 1;
      for (let i = 0; i < cars; i++) {
        const along = distance - i * 19.5;
        if (along < 0) continue;
        const alpha = Math.min(1, along / 8, (path.length - along) / 8);
        const color = path.kind === 'ferry' ? ferryPaint : trainPaint;
        if (draw(path.kind, trafficPose(path, along, 1, 0), color, alpha)) drawn++;
      }
    } else {
      const { class: roadClass, oneway } = path.properties;
      const [hourly, kmh] = roadTraffic[roadClass];
      const observed = path.observed;
      const speed = Math.min(kmh * 1.24, Math.max(kmh * .45, observed?.speed || kmh)) / 3.6;
      const oneWay = [1, -1, 'yes', '1', '-1'].includes(oneway) || roadClass === 'motorway';
      const split = !oneWay || ['motorway', 'trunk'].includes(roadClass) ? 2 : 1;
      const volume = (observed ? observed.daily / 24 : hourly) / split;
      const period = Math.max(1.15, 8 / speed, 3600 / volume);
      for (const direction of oneWay ? [Number(oneway) === -1 ? -1 : 1] : [1, -1]) {
        const phase = trafficHash(path.key + direction) / 4294967296 * period;
        const cycle = (time + phase) / period;
        for (let index = 0, age = (cycle - Math.floor(cycle)) * period;
          age * speed < path.length && index < 25; index++, age += period) {
          const along = age * speed;
          const alpha = Math.min(1, along / 5, (path.length - along) / 5);
          const color = carPaint[(seed + Math.floor(cycle) - index) % carPaint.length];
          const lane = roadClass === 'service' ? .68 : oneWay ? 1.08 : 1.35;
          if (draw('car', trafficPose(path, along, direction, lane), color, alpha)) drawn++;
          if (drawn >= limit) return;
        }
      }
    }
    if (drawn >= limit) return;
  }
}

function createMapTraffic(map) {
  const section = map.getContainer().closest('.map-section');
  const toggle = section.querySelector('#traffic-toggle');
  const status = section.querySelector('#traffic-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const observations = new Map();
  const origins = new Map();
  let override, paths = [], frameTimer, refreshTimer, renderer, anchor, zoomLevel, onScreen = true;
  let needsRefresh = true;
  const enabled = () => override ?? !reduced.matches;
  const active = () => enabled() && onScreen && !document.hidden && map.getZoom() >= trafficZoom;
  const observer = new IntersectionObserver(entries => {
    onScreen = entries[0].isIntersecting;
    queueRefresh(true);
  });
  observer.observe(map.getContainer());

  function feedSamples(feed) {
    if (!feed) return [];
    if (!observations.has(feed.id)) {
      observations.set(feed.id, []);
      fetch('/assets/traffic-' + feed.id + '.json')
        .then(response => response.ok ? response.json() : [])
        .then(data => { observations.set(feed.id, data); queueRefresh(true); })
        .catch(() => {});
    }
    return observations.get(feed.id);
  }

  function refresh() {
    toggle.setAttribute('aria-pressed', String(enabled()));
    if (!active()) {
      status.hidden = true;
      paths = [];
      needsRefresh = true;
      map.triggerRepaint();
      return;
    }
    const center = map.getCenter().wrap();
    const nextZoom = Math.floor(map.getZoom());
    if (!needsRefresh && anchor && zoomLevel === nextZoom && anchor.distanceTo(center) < 85) return;
    needsRefresh = false;
    anchor = center;
    zoomLevel = nextZoom;
    const window = trafficWindow(map);
    const feed = trafficFeeds.find(candidate => trafficIntersects(candidate.bounds, window));
    const available = visibleTrafficPaths(map, window, maplibregl.MercatorCoordinate.fromLngLat(center));
    const roads = available.filter(path => path.kind === 'car').slice(0, 210);
    applyTrafficCounts(roads, feedSamples(feed), window);
    const rail = available.filter(path => path.kind === 'train').slice(0, 2);
    const tram = available.filter(path => path.kind === 'tram').slice(0, 3);
    const ferry = available.filter(path => path.kind === 'ferry').slice(0, 2);
    paths = [...rail, ...tram, ...ferry, ...roads];
    if (origins.size > 180) origins.clear();
    const measured = roads.some(road => road.observed);
    status.hidden = paths.length === 0;
    status.textContent = measured ? `Simulated traffic · ${feed.label} volumes + estimates` : 'Simulated traffic · road estimates';
    map.triggerRepaint();
  }

  function queueRefresh(force = false) {
    needsRefresh ||= force;
    if (refreshTimer !== undefined) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      refresh();
    }, 160);
  }

  function forgetRenderer() { renderer = undefined; }
  function dataChanged(event) {
    if (event.sourceId === trafficSource) queueRefresh(true);
  }
  function preferenceChanged() { queueRefresh(true); }
  function mapMoved() { queueRefresh(); }
  toggle.onclick = () => {
    override = !enabled();
    queueRefresh(true);
  };
  map.on('moveend', mapMoved);
  map.on('sourcedata', dataChanged);
  reduced.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', preferenceChanged);
  map.addLayer({
    id: 'patria-traffic',
    type: 'custom',
    renderingMode: '3d',
    onAdd() { map.on('webglcontextlost', forgetRenderer); },
    onRemove() {
      clearTimeout(frameTimer);
      clearTimeout(refreshTimer);
      observer.disconnect();
      map.off('moveend', mapMoved);
      map.off('sourcedata', dataChanged);
      map.off('webglcontextlost', forgetRenderer);
      reduced.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', preferenceChanged);
      renderer?.destroy();
      forgetRenderer();
    },
    render(gl, { defaultProjectionData }) {
      if (!active() || !paths.length) return;
      renderer ??= trafficRenderer(gl);
      renderer.begin();
      const projection = defaultProjectionData.mainMatrix;
      streetVehicles(paths, origins, performance.now() / 1000, (kind, pose, color, alpha) => {
        if (alpha < .08) return false;
        const matrix = projectAvatar(projection, pose.location, pose.bearing);
        const w = matrix[15];
        if (w <= 0 || Math.abs(matrix[12]) > w * 1.22 || Math.abs(matrix[13]) > w * 1.22) return false;
        renderer.draw(kind, matrix, color, alpha);
        return true;
      }, innerWidth <= 720 ? 38 : 76);
      renderer.end();
      if (frameTimer === undefined) frameTimer = setTimeout(() => {
        frameTimer = undefined;
        if (active()) map.triggerRepaint();
      }, 33);
    },
  }, 'patria-walker');
  refresh();
}
