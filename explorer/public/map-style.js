const streetLayer = {
  curb: 'patria-street-curbs',
  sidewalk: 'patria-street-sidewalks',
  road: 'patria-street-asphalt',
  path: 'patria-street-paths',
  lane: 'patria-street-lanes',
  shadow: 'patria-building-shadows',
  facade: 'patria-street-buildings',
};

const isoFill = {
  park: '#62794d',
  water: '#3d7797',
  landcover_ice_shelf: '#bacacb',
  landcover_glacier: '#c9d5d4',
  landuse_residential: '#828075',
  landcover_wood: '#48644b',
  'aeroway-area': '#92918a',
  road_area_pier: '#948c7e',
};

const isoLine = {
  waterway: '#50899f',
  road_pier: '#9c917f',
  highway_path: '#a6a38b',
  highway_minor: '#626464',
  highway_major_casing: '#515455',
  highway_major_inner: '#787977',
  highway_major_subtle: '#727573',
  highway_motorway_casing: '#53565a',
  highway_motorway_inner: '#888783',
  highway_motorway_subtle: '#777d7d',
  highway_motorway_bridge_casing: '#555b60',
  highway_motorway_bridge_inner: '#8c8981',
  tunnel_motorway_casing: '#68655f',
  tunnel_motorway_inner: '#817e72',
  'aeroway-taxiway': '#a29d92',
  'aeroway-runway-casing': '#656662',
  'aeroway-runway': '#858581',
  railway_transit: '#535859',
  railway_transit_dashline: '#b1ada0',
  railway_service: '#535859',
  railway_service_dashline: '#a29d92',
  railway: '#585858',
  railway_dashline: '#a69b89',
  boundary_2: '#b1afa3',
  boundary_3: '#9e9f90',
  boundary_disputed: '#9e9f90',
};

const buildingHeight = ['to-number', ['get', 'render_height'], 8];
const roofMaterial = ['step', buildingHeight, '#aa9580', 6.5, '#a28d7f', 8, '#a87868',
  10, '#b1a28f', 13, '#9a9690', 17, '#aaa69b', 24, '#879398', 35, '#748999',
  60, '#8b9ca7', 100, '#758d9d'];
const roofColor = ['interpolate', ['linear'], 0.22,
  0, roofMaterial, 1, ['to-color', ['get', 'colour'], roofMaterial]];
const roadWidths = [
  [['motorway', 'trunk'], 10],
  [['primary', 'secondary'], 8.5],
  [['tertiary', 'minor'], 6.1],
  [['service', 'track'], 3.5],
  [['path', 'pedestrian'], 1.75],
];

function roadWidth(extra = 0) {
  const atScale = scale => ['match', ['get', 'class'],
    ...roadWidths.flatMap(([classes, width]) => [classes, (width + extra) * scale]), 0];
  return ['interpolate', ['exponential', 2], ['zoom'], 16, atScale(1.14), 22, atScale(1.14 * 64)];
}

function streetRoad(id, source, classes, paint) {
  return {
    id, source, 'source-layer': 'transportation', type: 'line', minzoom: 17,
    filter: ['all', ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      ['!=', ['get', 'brunnel'], 'tunnel'], ['in', ['get', 'class'], ['literal', classes]]],
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint,
  };
}

function neighborhoodStyle(_previous, style) {
  const footprint = style.layers.find(layer => layer.type === 'fill' && layer['source-layer'] === 'building');
  const layers = style.layers.map(layer => {
    const paint = { ...layer.paint };
    if (layer.type === 'background') paint['background-color'] = '#858575';
    if (layer === footprint) {
      paint['fill-color'] = roofColor;
      paint['fill-outline-color'] = '#615d58';
    }
    if (isoFill[layer.id]) paint['fill-color'] = isoFill[layer.id];
    if (isoLine[layer.id]) paint['line-color'] = isoLine[layer.id];
    if (layer.type === 'symbol' && layer.layout?.['text-field'] && paint['text-color']) {
      paint['text-color'] = layer['source-layer'] === 'water_name' ? '#d1e9f1' : '#f4efe1';
      paint['text-halo-color'] = '#333b3c';
      paint['text-halo-width'] = 1.1;
    }
    return { ...layer, paint };
  });
  const woodIndex = layers.findIndex(layer => layer.id === 'landcover_wood');
  if (woodIndex >= 0) {
    const woods = layers[woodIndex];
    layers.splice(woodIndex, 0, {
      ...woods, id: 'patria-grass',
      filter: ['all', ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        ['==', ['get', 'class'], 'grass']],
      paint: { ...woods.paint, 'fill-color': '#677c50' },
    });
  }
  const overlays = [];
  if (footprint) {
    const { source } = footprint;
    const driving = roadWidths.slice(0, -1).flatMap(([classes]) => classes);
    const walking = roadWidths.at(-1)[0];
    overlays.push(
      streetRoad(streetLayer.sidewalk, source, ['primary', 'secondary', 'tertiary', 'minor'], {
        'line-color': '#9b958a', 'line-width': roadWidth(3.4),
      }),
      streetRoad(streetLayer.curb, source, driving, {
        'line-color': '#b4a493', 'line-width': roadWidth(0.4),
      }),
      streetRoad(streetLayer.road, source, driving, {
        'line-color': '#504c4b', 'line-pattern': 'patria-asphalt', 'line-width': roadWidth(),
      }),
      streetRoad(streetLayer.path, source, walking, {
        'line-color': ['match', ['get', 'surface'], 'paved', '#a59d8f', '#99866b'],
        'line-width': roadWidth(),
      }),
      streetRoad(streetLayer.lane, source, ['motorway', 'trunk', 'primary', 'secondary'], {
        'line-color': '#bba477', 'line-opacity': 0.74, 'line-dasharray': [5, 6],
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 17, 0.18, 22, 5.8],
      }),
      {
        id: streetLayer.shadow, source, 'source-layer': 'building', type: 'fill', minzoom: 15,
        filter: ['!=', ['get', 'hide_3d'], true],
        layout: { visibility: 'none' },
        paint: {
          'fill-color': '#251d24', 'fill-opacity': 0.37, 'fill-translate-anchor': 'map',
          'fill-translate': ['interpolate', ['exponential', 1.8], ['zoom'],
            15, ['literal', [2, 2]], 21.5, ['literal', [42, 23]]],
        },
      }
    );
    const building = {
      source, 'source-layer': 'building', type: 'fill-extrusion', minzoom: 15,
      filter: ['!=', ['get', 'hide_3d'], true],
    };
    const heights = {
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
    };
    overlays.push(
      { ...building, id: buildingLayer, paint: { ...heights, 'fill-extrusion-color': roofColor } },
      {
        ...building, id: streetLayer.facade, layout: { visibility: 'none' },
        paint: {
          ...heights,
          'fill-extrusion-color': roofColor,
        },
      }
    );
  }
  overlays.push({
    id: walkLayer, type: 'line', source: walkLayer,
    paint: { 'line-color': '#f1b667', 'line-width': 3, 'line-dasharray': [1, 2] },
  });
  const symbols = layers.findIndex(layer => layer.type === 'symbol');
  layers.splice(symbols < 0 ? layers.length : symbols, 0, ...overlays);
  return {
    ...style,
    light: { anchor: 'map', color: '#fff3de', position: [1.15, 272, 39], intensity: 0.43 },
    layers,
    sources: { ...style.sources, [walkLayer]: { type: 'geojson', data: emptyWalk } },
  };
}

function texture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  return context.getImageData(0, 0, size, size);
}

function textureRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function foliageTexture(base, greens) {
  return texture(128, (context, size) => {
    const random = textureRandom(1823);
    context.fillStyle = base;
    context.fillRect(0, 0, size, size);
    for (let i = 0; i < 560; i++) {
      const x = Math.floor(random() * size);
      const y = Math.floor(random() * size);
      const radius = 2 + Math.floor(random() * 6);
      context.fillStyle = greens[Math.floor(random() * greens.length)];
      context.fillRect(x, y, radius, radius - 1);
      if (x + radius > size) context.fillRect(x - size, y, radius, radius - 1);
      if (y + radius > size) context.fillRect(x, y - size, radius, radius - 1);
    }
  });
}

function asphaltTexture() {
  return texture(128, (context, size) => {
    const random = textureRandom(2491);
    context.fillStyle = '#504c4b';
    context.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      context.fillStyle = i % 2 ? '#b1a89f16' : '#201e2522';
      context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1 + i % 2, 1 + i % 2);
    }
  });
}

function installMapMaterials(map) {
  map.addImage('patria-park-art', foliageTexture('#647b4d', ['#4d6844', '#718650', '#84945d', '#5b744b']));
  map.addImage('patria-wood-art', foliageTexture('#435c43', ['#344d39', '#506949', '#5f744e', '#49684a']));
  map.addImage('patria-asphalt', asphaltTexture());
  for (const [layer, pattern] of [
    ['park', 'patria-park-art'], ['patria-grass', 'patria-park-art'], ['landcover_wood', 'patria-wood-art'],
  ]) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, 'fill-pattern', pattern);
  }
}
