function measureWalk(coordinates) {
  const points = [];
  let length = 0;
  for (const [lng, lat] of coordinates) {
    const previous = points.at(-1);
    const longitude = previous ? lng + 360 * Math.round((previous.location.lng - lng) / 360) : lng;
    const location = new maplibregl.LngLat(longitude, lat);
    if (previous) {
      const segment = previous.location.distanceTo(location);
      if (segment < 0.01) continue;
      length += segment;
    }
    points.push({ location, distance: length });
  }
  if (points.length < 2) throw new Error('These points lead to the same spot on the path. Try a different destination.');

  function at(distance) {
    let low = 1;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (points[middle].distance < distance) low = middle + 1;
      else high = middle;
    }
    const from = points[low - 1];
    const to = points[low];
    const fraction = (distance - from.distance) / (to.distance - from.distance);
    return [
      from.location.lng + (to.location.lng - from.location.lng) * fraction,
      from.location.lat + (to.location.lat - from.location.lat) * fraction,
    ];
  }

  return { length, at, coordinates: points.map(point => point.location.toArray()) };
}

function createWalkPreview(map, { buildingLayer, streetLayers, tourLayer, getPlaces, requestRoute }) {
  const section = map.getContainer().closest('.map-section');
  const get = selector => section.querySelector(selector);
  const launch = get('#walk-preview-launch');
  const form = get('#walk-preview-form');
  const fields = get('#walk-preview-fields');
  const status = get('#walk-preview-status');
  const from = get('#walk-from');
  const to = get('#walk-to');
  const pickHint = get('#walk-pick-hint');
  const playback = get('#walk-playback');
  const playButton = get('#walk-play');
  const viewButton = get('#walk-view');
  const scrubber = get('#walk-progress');
  const lookArea = get('#walk-look');
  const labelDistance = meters => meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1) + ' km';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const routeLayer = 'patria-preview-route';
  const empty = { type: 'FeatureCollection', features: [] };

  let places = [], mapPoints = new Map(), picking = null, pending, invoker;
  let route, camera, progress = 0, frame, lastFrame, speed, yaw = 0, dragX;
  let endpointMarkers = [], positionMarker;

  map.addSource(routeLayer, { type: 'geojson', data: empty });
  map.addLayer({
    id: routeLayer + '-casing', source: routeLayer, type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#322c2c', 'line-width': 8, 'line-opacity': 0.85 },
  }, tourLayer);
  map.addLayer({
    id: routeLayer, source: routeLayer, type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#f3b363', 'line-width': 4 },
  }, tourLayer);
  const walker = createWalkAvatar(map, tourLayer);
  const streetDetails = createStreetDetails(map, routeLayer + '-casing');

  function marker(coordinates, className, text = '') {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    element.setAttribute('aria-hidden', 'true');
    return new maplibregl.Marker({ element }).setLngLat(coordinates).addTo(map);
  }

  function updateEndpoints(a, b) {
    endpointMarkers.forEach(pin => pin.remove());
    endpointMarkers = [a, b].flatMap((point, index) => point
      ? [marker(point, 'walk-endpoint', index === 0 ? 'A' : 'B')]
      : []);
  }

  function chosen(select) {
    return mapPoints.get(select.value) || places.find(place => place.id === select.value);
  }

  function refreshChoices(select, value) {
    const pick = mapPoints.get(select.id);
    const choices = pick ? [...places, pick] : places;
    select.replaceChildren(new Option('Choose a point', ''), ...choices.map(place => new Option(place.name, place.id)));
    select.value = value;
  }

  function refreshPlanner() {
    status.textContent = '';
    updateEndpoints(chosen(from)?.coordinates, chosen(to)?.coordinates);
  }

  function pause() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    playButton.textContent = route && progress >= route.length ? 'Replay' : 'Play';
  }

  function close(restoreFocus = false) {
    if (!section.dataset.walkMode) return;
    pending?.abort();
    pending = undefined;
    pause();
    picking = null;
    dragX = undefined;
    fields.disabled = false;
    form.hidden = pickHint.hidden = playback.hidden = lookArea.hidden = true;
    delete section.dataset.walkMode;
    updateEndpoints();
    positionMarker?.remove();
    positionMarker = undefined;
    walker.clear();
    if (route) {
      map.getSource(routeLayer).setData(empty);
      map.setLayoutProperty(buildingLayer, 'visibility', camera.buildings);
      map.setLayoutProperty(tourLayer, 'visibility', camera.tour);
      setStreetStyle(false);
      map.getCanvas().tabIndex = camera.tabIndex;
      map.stop().jumpTo(camera.options).setMaxPitch(camera.maxPitch).setVerticalFieldOfView(camera.fov);
      route = undefined;
    }
    if (restoreFocus) (invoker?.getClientRects().length ? invoker : launch).focus({ preventScroll: true });
  }

  function setStreetStyle(street) {
    streetDetails.setVisible(street);
    for (const layer of streetLayers) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', street ? 'visible' : 'none');
    }
    map.setLight(street ? { ...camera.light, color: '#ffe1b1', position: [1.15, 253, 56], intensity: 0.53 } : camera.light);
    for (const [id, visibility] of camera.labels) {
      map.setLayoutProperty(id, 'visibility', street ? 'none' : visibility);
    }
  }

  function open(destination, button = launch) {
    close();
    invoker = button;
    places = getPlaces(destination);
    mapPoints = new Map();
    const origin = places[0];
    refreshChoices(from, origin.id);
    const start = maplibregl.LngLat.convert(origin.coordinates);
    const different = places.find(place => start.distanceTo(maplibregl.LngLat.convert(place.coordinates)) >= 3);
    refreshChoices(to, destination?.id || different?.id || '');
    section.dataset.walkMode = 'planner';
    form.hidden = false;
    refreshPlanner();
    section.scrollIntoView({ block: 'nearest' });
    from.focus({ preventScroll: true });
  }

  function finishPicking() {
    const select = picking;
    picking = null;
    section.dataset.walkMode = 'planner';
    pickHint.hidden = true;
    form.hidden = false;
    refreshPlanner();
    select.focus({ preventScroll: true });
  }

  function pick(coordinates, name) {
    if (!picking) return false;
    const point = { id: picking.id, name: name || 'Selected map point', coordinates };
    mapPoints.set(point.id, point);
    refreshChoices(picking, point.id);
    finishPicking();
    return true;
  }

  function followWalker(position) {
    const fromLngLat = maplibregl.MercatorCoordinate.fromLngLat;
    const location = fromLngLat(position);
    const before = fromLngLat(route.at(Math.max(0, progress - 2)));
    const ahead = fromLngLat(route.at(Math.min(route.length, progress + 2.5)));
    const heading = Math.atan2(ahead.x - before.x, before.y - ahead.y);
    const strideLength = Math.max(1.45, speed / 1.55);
    const phase = 2 * Math.PI * progress / strideLength;
    walker.move(location, heading * 180 / Math.PI, phase, progress > 0 && progress < route.length);

    // Keep the camera on the route as it rounds a corner. Extrapolate at the start.
    const trail = fromLngLat(route.at(progress - 5.7));
    const scale = location.meterInMercatorCoordinateUnits();
    let east = trail.x - location.x;
    let south = trail.y - location.y;
    if (Math.hypot(east, south) < 2.6 * scale) {
      east = -Math.sin(heading) * 5.7 * scale;
      south = Math.cos(heading) * 5.7 * scale;
    }

    const orbit = yaw * Math.PI / 180;
    const offsetX = east * Math.cos(orbit) - south * Math.sin(orbit);
    const offsetY = east * Math.sin(orbit) + south * Math.cos(orbit);
    const eye = new maplibregl.MercatorCoordinate(location.x + offsetX, location.y + offsetY, 0).toLngLat();
    const bearing = Math.atan2(-offsetX, offsetY) * 180 / Math.PI;
    const eyeHeight = 3.05;
    const distanceToWalker = Math.hypot(east, south) / scale;
    const pitch = Math.atan2(distanceToWalker, eyeHeight - 1.25) * 180 / Math.PI;
    map.jumpTo(map.calculateCameraOptionsFromCameraLngLatAltRotation(eye, eyeHeight, bearing, pitch, 0));
  }

  function seek(distance) {
    progress = Math.max(0, Math.min(route.length, distance));
    const position = route.at(progress);
    positionMarker.setLngLat(position);
    if (section.dataset.walkMode === 'street') followWalker(position);
    scrubber.value = Math.round(1000 * progress / route.length);
    const current = labelDistance(route.distance * progress / route.length) + ' of ' + labelDistance(route.distance);
    scrubber.setAttribute('aria-valuetext', current);
    get('#walk-distance-progress').textContent = current;
  }

  function tick(now) {
    if (now - lastFrame >= 32) {
      seek(progress + speed * Math.min(now - lastFrame, 120) / 1000);
      lastFrame = now;
    }
    if (progress >= route.length) pause();
    else frame = requestAnimationFrame(tick);
  }

  function play() {
    if (progress >= route.length) seek(0);
    yaw = 0;
    lastFrame = performance.now();
    playButton.textContent = 'Pause';
    frame = requestAnimationFrame(tick);
  }

  function setView(mode) {
    section.dataset.walkMode = mode;
    const street = mode === 'street';
    dragX = undefined;
    lookArea.hidden = !street;
    map.getCanvas().tabIndex = street ? -1 : camera.tabIndex;
    map.setVerticalFieldOfView(street ? 65 : camera.fov);
    map.setLayoutProperty(buildingLayer, 'visibility', 'none');
    setStreetStyle(street);
    viewButton.textContent = street ? 'Route overview' : 'Street level';
    if (!street) {
      walker.clear();
      const bounds = new maplibregl.LngLatBounds();
      route.coordinates.forEach(coordinate => bounds.extend(coordinate));
      const padding = {
        top: get('.walk-playback-heading').offsetHeight + 32,
        bottom: get('.walk-transport').offsetHeight + 39,
        left: 34, right: 34,
      };
      const overview = map.cameraForBounds(bounds, { padding, bearing: 0, maxZoom: 18 });
      if (overview) map.jumpTo({ ...overview, bearing: 0, pitch: 0 });
    }
    seek(progress);
  }

  function start(result, startPoint, endPoint) {
    const path = measureWalk(result.geometry.coordinates);
    map.stop();
    camera = {
      options: { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      maxPitch: map.getMaxPitch(),
      fov: map.getVerticalFieldOfView(),
      tabIndex: map.getCanvas().tabIndex,
      buildings: map.getLayoutProperty(buildingLayer, 'visibility') || 'visible',
      tour: map.getLayoutProperty(tourLayer, 'visibility') || 'visible',
      light: map.getLight(),
      labels: map.getStyle().layers.filter(layer => layer.type === 'symbol')
        .map(layer => [layer.id, layer.layout?.visibility || 'visible']),
    };
    route = { ...path, distance: result.distance };
    progress = yaw = 0;
    speed = Math.min(7, route.length / Math.max(6, Math.min(90, route.length / 2.6)));
    form.hidden = true;
    playback.hidden = false;
    get('#walk-route-title').textContent = startPoint.name + ' → ' + endPoint.name;
    get('#walk-route-summary').textContent = labelDistance(result.distance) + ' · about ' + Math.max(1, Math.round(result.duration / 60)) + ' min on foot';
    map.setMaxPitch(85);
    map.setLayoutProperty(tourLayer, 'visibility', 'none');
    map.getSource(routeLayer).setData({ type: 'LineString', coordinates: path.coordinates });
    updateEndpoints(path.coordinates[0], path.coordinates.at(-1));
    positionMarker = marker(path.coordinates[0], 'walk-position');
    setView('street');
    if (!reducedMotion.matches) play();
    else pause();
    playButton.focus({ preventScroll: true });
  }

  function step(delta) {
    pause();
    seek(progress + delta);
    pause();
  }

  launch.disabled = false;
  launch.onclick = () => open();
  get('#walk-cancel').onclick = get('#walk-exit').onclick = () => close(true);
  from.onchange = to.onchange = refreshPlanner;
  section.querySelectorAll('[data-pick-walk-point]').forEach(button => {
    button.onclick = () => {
      picking = button.dataset.pickWalkPoint === 'from' ? from : to;
      section.dataset.walkMode = 'picking';
      form.hidden = true;
      pickHint.hidden = false;
      get('#walk-pick-instruction').textContent = picking === from ? 'Click your starting point on the map.' : 'Click your destination on the map.';
      get('#walk-pick-cancel').focus({ preventScroll: true });
    };
  });
  get('#walk-pick-cancel').onclick = finishPicking;
  map.on('click', event => pick(event.lngLat.wrap().toArray()));

  form.onsubmit = async event => {
    event.preventDefault();
    const startPoint = chosen(from);
    const endPoint = chosen(to);
    if (!startPoint || !endPoint || startPoint === endPoint) {
      status.textContent = 'Choose two different points to start.';
      return;
    }
    fields.disabled = true;
    status.textContent = 'Finding a walking route…';
    const request = new AbortController();
    pending = request;
    try {
      const result = await requestRoute(startPoint.coordinates, endPoint.coordinates, request.signal);
      if (!request.signal.aborted) start(result, startPoint, endPoint);
    } catch (error) {
      if (!request.signal.aborted) status.textContent = error.message;
    } finally {
      if (pending === request) {
        pending = undefined;
        fields.disabled = false;
      }
    }
  };

  playButton.onclick = () => frame === undefined ? play() : pause();
  viewButton.onclick = () => setView(section.dataset.walkMode === 'street' ? 'overview' : 'street');
  get('#walk-backward').onclick = () => step(-10);
  get('#walk-forward').onclick = () => step(10);
  scrubber.oninput = () => {
    pause();
    seek(Number(scrubber.value) * route.length / 1000);
    pause();
  };

  lookArea.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    pause();
    dragX = event.clientX;
    lookArea.setPointerCapture(event.pointerId);
  };
  lookArea.onpointermove = event => {
    if (!event.isPrimary || dragX === undefined) return;
    yaw = Math.max(-75, Math.min(75, yaw - (event.clientX - dragX) * 0.35));
    dragX = event.clientX;
    seek(progress);
  };
  lookArea.onlostpointercapture = () => { dragX = undefined; };
  lookArea.onkeydown = event => {
    if (event.key === 'ArrowUp') step(10);
    else if (event.key === 'ArrowDown') step(-10);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      pause();
      yaw = Math.max(-75, Math.min(75, yaw + (event.key === 'ArrowRight' ? 15 : -15)));
      seek(progress);
    } else return;
    event.preventDefault();
  };
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !section.dataset.walkMode || document.querySelector('dialog[open]')) return;
    if (picking) finishPicking();
    else close(true);
  });

  return { open, close, pick };
}
