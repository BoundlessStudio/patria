import { writeFile } from 'node:fs/promises';

const assetDirectory = new URL('../data/traffic/', import.meta.url);
const torontoTable = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';
const calgaryTable = 'https://data.calgary.ca/resource/cauu-7hnw.geojson?$limit=5000';
const quebecMap = 'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:circulation_routier&srsname=EPSG:4326&outputformat=geojson';
const quebecMetros = [
  [-74.3, 45.24, -73.19, 45.87], // Montréal
  [-71.58, 46.61, -70.87, 47.05], // Québec and Lévis
  [-76.14, 45.30, -75.32, 45.72], // Gatineau
  [-72.15, 45.24, -71.64, 45.65], // Sherbrooke
  [-72.91, 46.22, -72.24, 46.52], // Trois-Rivières
];

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Traffic data request failed (${response.status}): ${url}`);
  return response.json();
}

function point(lng, lat, daily, speed = 0, bearing = null, street = '') {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(daily)
      || Math.abs(lng) > 180 || Math.abs(lat) > 90 || daily <= 0 || daily > 450000) return null;
  return [Number(lng.toFixed(5)), Number(lat.toFixed(5)), Math.round(daily), Math.round(speed || 0), bearing, street];
}

async function toronto() {
  const points = [];
  let offset = 0;
  let records;
  do {
    const url = new URL(torontoTable);
    url.search = new URLSearchParams({
      resource_id: 'e90038e7-ccb9-4bd2-af3e-696adc904c18',
      fields: 'latest_count_date_start,latest_count_duration,location_name,longitude,latitude,avg_weekday_daily_vol,avg_daily_vol,avg_speed',
      limit: 5000, offset, sort: '_id asc',
    });
    const result = (await json(url)).result;
    records = result.records;
    for (const record of records) {
      if (Number(record.latest_count_duration) < 24 || record.latest_count_date_start < '2018-01-01') continue;
      const daily = Number(record.avg_weekday_daily_vol ?? record.avg_daily_vol);
      const street = record.location_name?.split(':')[0]?.trim() || '';
      const sample = point(record.longitude, record.latitude, daily, Number(record.avg_speed), null, street);
      if (sample) points.push(sample);
    }
    offset += records.length;
  } while (records.length >= 5000);
  return points;
}

function lineSamples(geometry, daily, interval, accept = () => true) {
  const lines = geometry?.type === 'MultiLineString' ? geometry.coordinates : [geometry?.coordinates];
  const samples = [];
  for (const line of lines) {
    if (!line || line.length < 2) continue;
    const cosine = Math.cos(line[0][1] * Math.PI / 180);
    const segments = [];
    let total = 0;
    for (let i = 1; i < line.length; i++) {
      const from = line[i - 1];
      const to = line[i];
      const x = (to[0] - from[0]) * cosine;
      const y = to[1] - from[1];
      const length = 111195 * Math.hypot(x, y);
      if (length < 1) continue;
      segments.push({ from, to, x, y, length, start: total });
      total += length;
    }
    let index = 0;
    for (let distance = Math.min(interval / 2, total / 2); distance < total; distance += interval) {
      while (distance >= segments[index].start + segments[index].length) index++;
      const { from, to, x, y, length, start } = segments[index];
      const fraction = (distance - start) / length;
      const lng = from[0] + (to[0] - from[0]) * fraction;
      const lat = from[1] + (to[1] - from[1]) * fraction;
      if (!accept(lng, lat)) continue;
      const bearing = (Math.round(Math.atan2(x, y) * 180 / Math.PI) + 360) % 180;
      const sample = point(lng, lat, daily, 0, bearing);
      if (sample) samples.push(sample);
    }
  }
  return samples;
}

async function calgary() {
  const data = await json(calgaryTable);
  return data.features.flatMap(({ geometry, properties }) =>
    lineSamples(geometry, Number(properties.volume), 100)
  );
}

async function quebec() {
  const data = await json(quebecMap);
  const nearCity = (lng, lat) => quebecMetros.some(([west, south, east, north]) =>
    lng >= west && lng <= east && lat >= south && lat <= north
  );
  return data.features.flatMap(({ geometry, properties }) => {
    const daily = [1, 2, 3, 4].map(index => Number(properties['val_djma_annee_' + index])).find(volume => volume > 0);
    return daily ? lineSamples(geometry, daily, 135, nearCity) : [];
  });
}

for (const [name, load] of Object.entries({ toronto, calgary, quebec })) {
  const points = await load();
  if (!points.length) throw new Error(`No usable traffic observations for ${name}.`);
  await writeFile(new URL(`traffic-${name}.json`, assetDirectory), JSON.stringify(points) + '\n');
  console.log(`${name}: ${points.length} samples`);
}
