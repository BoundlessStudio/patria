const streetFurniture = {
  bicycle_parking: [
    [-.22, 0, .055, .065, 0, .83, '#596763'],
    [.22, 0, .055, .065, 0, .83, '#596763'],
    [0, 0, .50, .065, .77, .83, '#596763'],
  ],
  waste_basket: [
    [0, 0, .43, .43, .02, .83, '#525c4b'],
    [0, 0, .47, .47, .83, .90, '#3d4640'],
  ],
  bus_stop: [
    [0, 0, .075, .075, 0, 2.45, '#6f736c'],
    [0, 0, .27, .065, 2.07, 2.47, '#a78667'],
  ],
  tram_stop: [
    [0, 0, .075, .075, 0, 2.45, '#6f736c'],
    [0, 0, .27, .065, 2.07, 2.47, '#a36c61'],
  ],
};

function furniturePart(location, [x, y, width, depth, base, height, color]) {
  const scale = location.meterInMercatorCoordinateUnits();
  const left = x - width / 2, right = x + width / 2;
  const top = y - depth / 2, bottom = y + depth / 2;
  const ring = [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]]
    .map(([east, south]) => new maplibregl.MercatorCoordinate(
      location.x + east * scale, location.y + south * scale,
    ).toLngLat().toArray());
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { base, height, color } };
}

function createStreetDetails(map, before) {
  const layer = 'patria-street-details';
  const empty = { type: 'FeatureCollection', features: [] };
  let visible = false, anchor, timer;
  map.addSource(layer, { type: 'geojson', data: empty });
  map.addLayer({
    id: layer, source: layer, type: 'fill-extrusion', layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-color': ['get', 'color'],
    },
  }, before);

  function refresh() {
    anchor = map.getCenter().wrap();
    const nearby = new Map();
    for (const { geometry, properties } of map.querySourceFeatures('openmaptiles', {
      sourceLayer: 'poi',
      filter: ['in', ['get', 'subclass'], ['literal', Object.keys(streetFurniture)]],
    })) {
      if (geometry.type !== 'Point' || properties.indoor || Number(properties.layer ?? 0) !== 0
          || Number(properties.level ?? 0) !== 0) continue;
      const coordinates = geometry.coordinates;
      const distance = anchor.distanceTo(maplibregl.LngLat.convert(coordinates));
      if (distance > 220) continue;
      const key = [properties.subclass, ...coordinates.map(value => value.toFixed(5))].join(':');
      nearby.set(key, { coordinates, distance, parts: streetFurniture[properties.subclass] });
    }
    const features = [...nearby.values()].sort((a, b) => a.distance - b.distance).slice(0, 100)
      .flatMap(({ coordinates, parts }) => {
        const location = maplibregl.MercatorCoordinate.fromLngLat(coordinates);
        return parts.map(part => furniturePart(location, part));
      });
    map.getSource(layer).setData({ ...empty, features });
  }

  function schedule() {
    if (!visible || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      refresh();
    }, 180);
  }

  map.on('moveend', () => {
    if (visible && (!anchor || anchor.distanceTo(map.getCenter().wrap()) > 55)) schedule();
  });
  map.on('sourcedata', event => {
    if (event.sourceId === 'openmaptiles') schedule();
  });
  map.once('remove', () => clearTimeout(timer));

  return {
    setVisible(value) {
      visible = value;
      map.setLayoutProperty(layer, 'visibility', value ? 'visible' : 'none');
      if (value) {
        schedule();
      } else {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
