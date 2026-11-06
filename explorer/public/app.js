/* Patria neighborhood explorer. */
const $ = (s) => document.querySelector(s);
const paths = {
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
 locate:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
 chevron:'<path d="m8 10 4 4 4-4"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 coffee:'<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 1 1 0 6h-2M7 3v2m4-2v2M3 22h15"/>',
 food:'<path d="M5 2v7m3-7v7M2 2v7a3 3 0 0 0 6 0M5 12v10M18 2c-3 2-4 5-4 9h4m0-9v20"/>',
 parks:'<path d="m12 2-5 7h3l-5 7h6v6h2v-6h6l-5-7h3l-5-7Z"/>',
 culture:'<path d="m3 8 9-5 9 5H3Zm2 3v8m5-8v8m4-8v8m5-8v8M3 22h18M3 19h18"/>',
 shops:'<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
 bookmark:'<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 walk:'<circle cx="14" cy="4" r="2"/><path d="m8 11 4-4 4 4h4M12 7l-2 8-5 6m5-6 5 2 2 5"/>',
 street:'<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13.5" r="3"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
 external:'<path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7"/>'
};
function icon(name){ return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.pin}</svg>`; }
function icons(root = document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function esc(v){return String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:'#';}catch{return '#';}}
const categoryNames={all:'Everything',coffee:'Coffee',food:'Food',parks:'Green spaces',culture:'Art & culture',shops:'Shops'};
const neighborhoods = [
 {id:'kensington',name:'Kensington Market',city:'Toronto',center:[43.6547,-79.4015],image:'kensington-market.jpg',alt:'Shops and pedestrians along Kensington Avenue in Toronto.',vibe:'Coffee, colorful streets & small discoveries',walkTitle:'The Kensington slow stroll',walkDescription:'A coffee break, a browse, and a patch of green. Take the scenic way through the market.',stops:['fika','vintage','blackbird','bellevue']},
 {id:'trinity',name:'Trinity Bellwoods',city:'Toronto',center:[43.6462,-79.4135],image:'trinity-bellwoods.jpg',alt:'Walking paths and the green bowl of Trinity Bellwoods Park.',vibe:'Park paths, bookshops & a coffee break',walkTitle:'A park-side afternoon',walkDescription:'Pick up a book, make time for coffee, then wander into the park.',stops:['type','squirrel','trinitypark']},
 {id:'distillery',name:'Distillery District',city:'Toronto',center:[43.6503,-79.3597],image:'distillery-district.webp',alt:'Visitors on a brick pedestrian lane in Toronto’s Distillery District.',vibe:'Brick lanes, galleries & something sweet',walkTitle:'Art, chocolate & old brick',walkDescription:'Follow your curiosity through the pedestrian lanes of the historic district.',stops:['balzacs','corkin','soma','young']}
];
const curated = [
 {id:'fika',area:'kensington',name:'FIKA Café',category:'coffee',lat:43.6537,lng:-79.4002,address:'28 Kensington Avenue',description:'A Swedish-inspired coffee break in a century-old home. Housemade pastries and a book-lined back room invite you to linger.',source:'https://www.fika.ca/',sourceLabel:'FIKA Café'},
 {id:'vintage',area:'kensington',name:'Kensington Avenue',category:'shops',lat:43.6542,lng:-79.4007,address:'Kensington Avenue',description:'Browse the neighborhood’s cluster of independent vintage shops. Leave yourself room for a find you weren’t looking for.',source:'https://www.destinationtoronto.com/travel-trade/tools-resources/itineraries/more-ideas/local-experiences/',sourceLabel:'Destination Toronto'},
 {id:'blackbird',area:'kensington',name:'Blackbird Baking Co.',category:'food',lat:43.6546,lng:-79.4006,address:'172 Baldwin Street',description:'A bakery stop on Baldwin Street, in the heart of Kensington Market. A good excuse to take the walk slowly.',source:'https://www.toronto.ca/legdocs/mmis/2025/te/bgrd/backgroundfile-251646.pdf',sourceLabel:'City of Toronto heritage plan'},
 {id:'bellevue',area:'kensington',name:'Bellevue Square Park',category:'parks',lat:43.6538,lng:-79.4025,address:'5 Bellevue Avenue',description:'A little green space at the center of the neighborhood. Pause here between the market’s streets and shops.',source:'https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=263&title=Bellevue-Square-Park',sourceLabel:'City of Toronto'},
 {id:'augusta',area:'kensington',name:'Augusta Avenue',category:'culture',lat:43.6551,lng:-79.4024,address:'Augusta Avenue',description:'Look up, slow down, and take in the neighborhood’s colorful storefronts and street art.',source:'https://www.destinationtoronto.com/leisure-blog/post/guide-to-kensington-market/',sourceLabel:'Destination Toronto'},
 {id:'type',area:'trinity',name:'TYPE Books',category:'shops',lat:43.6450,lng:-79.4117,address:'883 Queen Street West',description:'An independent Toronto bookstore on Queen West. Find something to read before settling into a park-side afternoon.',source:'https://typebooks.ca/',sourceLabel:'TYPE Books'},
 {id:'squirrel',area:'trinity',name:'The White Squirrel',category:'coffee',lat:43.6448,lng:-79.4125,address:'907 Queen Street West',description:'A coffee stop on Queen West across from Trinity Bellwoods Park.',source:'https://whitesquirrelcoffee.com/?page_id=5382',sourceLabel:'The White Squirrel'},
 {id:'trinitypark',area:'trinity',name:'Trinity Bellwoods Park',category:'parks',lat:43.6475,lng:-79.4138,address:'790 Queen Street West',description:'Open lawns, mature trees, and paths through one of Toronto’s well-used neighborhood parks. Choose a path and take your time.',source:'https://www.toronto.ca/city-government/planning-development/construction-new-facilities/park-facility-projects/trinity-bellwoods-park-access-circulation-study/',sourceLabel:'City of Toronto'},
 {id:'balzacs',area:'distillery',name:'Balzac’s Coffee',category:'coffee',lat:43.6504,lng:-79.3591,address:'1 Trinity Street',description:'Begin with a coffee in the Distillery District, then follow the brick lanes to your next stop.',source:'https://www.thedistillerydistrict.com/dining/',sourceLabel:'Distillery District directory'},
 {id:'corkin',area:'distillery',name:'Corkin Gallery',category:'culture',lat:43.6502,lng:-79.3596,address:'7 Tank House Lane',description:'An art stop tucked among the district’s historic buildings. Check the gallery’s current exhibition before visiting.',source:'https://www.corkingallery.com/',sourceLabel:'Corkin Gallery'},
 {id:'soma',area:'distillery',name:'SOMA Chocolatemaker',category:'food',lat:43.6500,lng:-79.3598,address:'32 Tank House Lane',description:'Chocolate made with curiosity about the cacao bean. Stop in the district’s chocolate shop or explore its tasting experiences.',source:'https://www.somachocolate.com/pages/tastings',sourceLabel:'SOMA Chocolatemaker'},
 {id:'young',area:'distillery',name:'Young Centre',category:'culture',lat:43.6508,lng:-79.3574,address:'50 Tank House Lane',description:'A performing arts stop in the historic district. Explore the program and plan a return for a performance.',source:'https://soulpepper.ca/',sourceLabel:'Young Centre'}
];
const state={area:neighborhoods[0],center:neighborhoods[0].center,places:curated.filter(p=>p.area==='kensington'),view:'explore',category:'all',selected:null,tour:null,loading:false,error:'',request:0};
const neighborhoodTilt = 50;
const neighborhoodZoom = 17.6;
let map, AdvancedMarkerElement, routeLine, traffic, streetService, streetSource, streetPreference;
let mapLayer = '3d', streetRequest = 0, streetInvoker, markers = [], searchController, nearbyController, toastTimer;
let marbleWorlds;
let saved=[],savedKey='patria-saved:preview',preferredInterests=[]; function configureSaved(user){savedKey='patria-saved:'+(user?.id||'preview');try{saved=JSON.parse(localStorage.getItem(savedKey)||'[]').filter(p=>p&&typeof p.id==='string'&&(p.provider==='google'||(typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)))).slice(0,100);}catch{saved=[];}render();}
function persist(){try{localStorage.setItem(savedKey,JSON.stringify(saved));}catch{toast('Saved for this visit. Your browser’s storage is unavailable.');}}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
function distance(p){const [lat,lng]=state.center;const r=Math.PI/180;const a=Math.sin((p.lat-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(p.lat*r)*Math.sin((p.lng-lng)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function distanceLabel(p){const d=distance(p);return d<1000?`${Math.round(d/10)*10} m away`:`${(d/1000).toFixed(1)} km away`;}
function visiblePlaces(){const places=state.view==='saved'?saved.filter(p=>p.provider!=='google'):state.places;const items=places.filter(p=>state.category==='all'||p.category===state.category);return state.view==='saved'?items:items.sort((a,b)=>Number(preferredInterests.includes(b.category))-Number(preferredInterests.includes(a.category)));}
function directionsUrl(places){
 const coordinates=places.map(p=>[p.lat,p.lng].join(','));
 const params={travelmode:'walking',destination:coordinates.at(-1)};
 if(coordinates.length>1)params.origin=coordinates[0];
 if(coordinates.length>2)params.waypoints=coordinates.slice(1,-1).join('|');
 return googleMapLink('/maps/dir/',params);
}
function googleMapLink(path, params) {
 const url = new URL(path, 'https://www.google.com');
 url.search = new URLSearchParams({ api: '1', ...params });
 return url.href;
}
function setMapControls(enabled) {
 for (const selector of ['#zoom-in', '#zoom-out', '#recenter-button', '#layers-button', '#street-view-button']) {
  $(selector).disabled = !enabled;
 }
}

function showMapError(message) {
 $('#map-error').querySelector('span').textContent = message;
 $('#map-error').hidden = false;
 setMapControls(false);
 map = undefined;
 renderDetail();
}

async function initializeGoogleMap() {
 const { browserKey, mapId } = await api('/api/map-config');
 let authorizationFailed = false;
 await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  const timer = setTimeout(() => reject(new Error('Google Maps took too long to load. Refresh the page to try again.')), 15000);
  window.patriaGoogleReady = () => {
   clearTimeout(timer);
   resolve();
  };
  window.gm_authFailure = () => {
   clearTimeout(timer);
   authorizationFailed = true;
   const message = 'Google Maps could not authorize this site address.';
   showMapError(message);
   reject(new Error(message));
  };
  script.onerror = () => {
   clearTimeout(timer);
   reject(new Error('Google Maps could not load. Refresh the page to try again.'));
  };
  const params = new URLSearchParams({ key: browserKey, loading: 'async', callback: 'patriaGoogleReady', v: 'quarterly' });
  script.src = 'https://maps.googleapis.com/maps/api/js?' + params;
  script.async = true;
  document.head.append(script);
 });
 const [maps, marker, street] = await Promise.all([
  google.maps.importLibrary('maps'), google.maps.importLibrary('marker'), google.maps.importLibrary('streetView'),
 ]);
 if (authorizationFailed) return;

 const [lat, lng] = state.selected ? [state.selected.lat, state.selected.lng] : state.center;
 map = new maps.Map($('#map'), {
  mapId, renderingType: google.maps.RenderingType.VECTOR,
  center: { lat, lng }, zoom: neighborhoodZoom, tilt: neighborhoodTilt, heading: 0,
  disableDefaultUI: true, streetViewControl: true, clickableIcons: false,
  streetViewControlOptions: { position: google.maps.ControlPosition.INLINE_START_BLOCK_END },
 });
 AdvancedMarkerElement = marker.AdvancedMarkerElement;
 traffic = new maps.TrafficLayer();
 routeLine = new maps.Polyline({ strokeColor: '#edb979', strokeOpacity: 0.95, strokeWeight: 4 });
 streetService = new street.StreetViewService();
 streetSource = street.StreetViewSource.OUTDOOR;
 streetPreference = street.StreetViewPreference.NEAREST;
 const panorama = map.getStreetView();
 panorama.setOptions({ enableCloseButton: false });
 panorama.addListener('visible_changed', () => {
  const visible = panorama.getVisible();
  $('.map-section').toggleAttribute('data-street-view', visible);
  const backButton = $('#street-view-back');
  backButton.hidden = !visible;
  if (visible) {
   streetRequest++;
   backButton.focus({ preventScroll: true });
  }
 });
 map.addListener('dragstart', () => { streetRequest++; });
 map.addListener('dragend', () => { $('#search-area').hidden = false; });
 setMapControls(true);
 renderMarkers();
 renderWalk();
 renderDetail();
}

function mapCenter() {
 const center = map?.getCenter();
 return center ? [center.lat(), center.lng()] : state.center;
}

function panTo([lat, lng], zoom = neighborhoodZoom) {
 if (!map) return;
 closeStreetView();
 map.moveCamera({ center: { lat, lng }, zoom, tilt: mapLayer === '3d' ? neighborhoodTilt : 0 });
}

function closeStreetView() {
 streetRequest++;
 const panorama = map?.getStreetView();
 if (panorama?.getVisible()) panorama.setVisible(false);
}

async function openStreetView([lat, lng], button) {
 if (!map) return;
 const request = ++streetRequest;
 button.disabled = true;
 toast('Finding outdoor Street View nearby…');
 try {
  const { data } = await streetService.getPanorama({
   location: { lat, lng }, radius: 75, preference: streetPreference, sources: [streetSource],
  });
  if (request !== streetRequest || !map || !button.isConnected) return;
  if (!data.location?.pano) throw new Error('No nearby panorama');
  const panorama = map.getStreetView();
  streetInvoker = button;
  panorama.setPano(data.location.pano);
  panorama.setPov({ heading: map.getHeading() || 0, pitch: 0 });
  panorama.setVisible(true);
  $('#toast').hidden = true;
 } catch {
  if (request === streetRequest) toast('Street View is unavailable at this point. Try another spot or drag Pegman to a blue street.');
 } finally {
  button.disabled = false;
 }
}

function renderMarkers() {
 if (!map) return;
 markers.forEach(marker => { marker.map = null; });
 const origin = document.createElement('span');
 origin.className = 'map-origin';
 const [lat, lng] = state.center;
 const startingPoint = new AdvancedMarkerElement({ map, position: { lat, lng }, title: 'Your starting point', zIndex: 1 });
 startingPoint.append(origin);
 markers = [startingPoint];
 for (const place of state.tour?.stops || visiblePlaces()) {
  const selected = place.id === state.selected?.id;
  const pin = document.createElement('span');
  pin.className = selected ? 'map-pin selected' : 'map-pin';
  const marker = new AdvancedMarkerElement({
   map, position: { lat: place.lat, lng: place.lng }, title: place.name, gmpClickable: true,
   anchorLeft: '-50%', anchorTop: '-50%', zIndex: selected ? 3 : 2,
  });
  marker.append(pin);
  marker.addEventListener('gmp-click', () => selectPlace(place));
  markers.push(marker);
 }
}
function renderWalk() {
 if (!routeLine || !map) return;
 const coordinates = state.tour?.stops.map(({ lat, lng }) => ({ lat, lng })) ?? [];
 routeLine.setPath(coordinates);
 routeLine.setMap(coordinates.length > 1 ? map : null);
}
function marbleLink(kind, target) {
 const world = marbleWorlds?.[kind]?.[target];
 if (typeof world?.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(world.id)) return '';
 const credits = Array.isArray(world.sources) ? world.sources.filter(source => source?.url && source.credit && source.license).map(source =>
  `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.credit)} · ${esc(source.license)}</a>`
 ).join(' · ') : '';
 return `<div class="marble-preview">
  <a href="https://marble.worldlabs.ai/world/${world.id}" target="_blank" rel="noopener noreferrer">Explore in Marble ${icon('external')}</a>
  <small>AI-generated scene${credits ? ' · ' + credits : ''}</small>
 </div>`;
}
function renderLegacySaves() {
 if (state.view !== 'saved' || state.category !== 'all') return [];
 return saved.filter(place => place.provider === 'google').map((place, index) => {
  const name = 'Saved Google place ' + (index + 1);
  const url = googleMapLink('/maps/search/', { query: 'Saved place', query_place_id: place.id.replace(/^google:/, '') });
  return `<div class="place-row">
   <a class="place-main" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
    <span class="place-icon">${icon('pin')}</span><span><h3>${name}</h3><p>Open in Google Maps</p></span>
   </a>
   <button class="save-button saved" data-save="${esc(place.id)}" aria-label="Unsave ${name}" aria-pressed="true">${icon('bookmark')}</button>
  </div>`;
 });
}
function render(){
 $('#saved-count').textContent=saved.length;
 $('.interests-section').hidden=state.view==='walks';
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
 $('#interests').innerHTML=Object.entries(categoryNames).map(([k,v])=>`<button class="interest ${state.category===k?'active':''}" data-category="${k}" aria-pressed="${state.category===k}">${icon(k==='all'?'compass':k)}${v}</button>`).join('');
 $('#location-label').textContent=state.area.city?`${state.area.name}, ${state.area.city}`:state.area.name;$('#map-title').textContent=state.area.name;
 $('#data-note').textContent=state.area.id&&state.view!=='saved'?'Curated Toronto collection':'OpenStreetMap';
 const feature=$('#walk-feature');feature.hidden=state.view==='saved';
 if(state.area.image){feature.innerHTML=`<div class="walk-photo"><img src="assets/${esc(state.area.image)}" alt="${esc(state.area.alt)}"><span class="walk-badge">A NEIGHBORHOOD WALK</span></div><div class="walk-copy"><h3>${esc(state.area.walkTitle)}</h3><p>${esc(state.area.walkDescription)}</p><div class="walk-meta"><span>${icon('walk')}${state.area.stops.length} stops · Go at your pace</span><button data-start-tour>Explore the walk</button></div>${marbleLink('walks',state.area.id)}</div>`;}
 else{feature.innerHTML=`<div class="walk-copy"><span class="eyebrow">MAKE A LITTLE DETOUR</span><h3 style="margin-top:10px">A wander around ${esc(state.area.name)}</h3><p>Connect a few nearby places into a walk you can take at your own pace.</p><div class="walk-meta"><span>${icon('walk')}Up to 4 nearby stops</span><button data-start-tour ${state.loading||!state.places.length?'disabled':''}>Make a walk</button></div></div>`;}
 const items=visiblePlaces(), legacySaves=renderLegacySaves();
 const discovering=state.view!=='saved'&&state.loading;
 const discoveryError=state.view!=='saved'&&state.error;
 $('#result-count').textContent=discovering?'':`${items.length+legacySaves.length} places`;
 $('#list-title').textContent=state.view==='saved'?'Your little collection':state.view==='walks'?'Stops along the way':'Worth a little wander';
 $('#list-context').textContent=state.view==='saved'?'Places you’ve saved on this device.':!state.area.id?'OpenStreetMap · Distances from your starting point.':'A few good places to start. Make the day your own.';
 const rows=items.map(p=>`<div class="place-row"><button class="place-main" data-place="${esc(p.id)}"><span class="place-icon ${esc(p.category)}">${icon(p.category)}</span><span><h3>${esc(p.name)}</h3><p>${esc(categoryNames[p.category]||'Place')} · ${distanceLabel(p)}</p></span></button><button class="save-button ${saved.some(s=>s.id===p.id)?'saved':''}" data-save="${esc(p.id)}" aria-label="${saved.some(s=>s.id===p.id)?'Unsave':'Save'} ${esc(p.name)}" aria-pressed="${saved.some(s=>s.id===p.id)}">${icon('bookmark')}</button></div>`).concat(legacySaves);
 $('#places-list').innerHTML=discovering?'<div class="loading">Finding places around you…</div>':rows.length?rows.join(''):`<div class="empty-state">${discoveryError?esc(discoveryError):state.view==='saved'?'A new favorite starts with a little curiosity. Save a place to find it here.':'No places match this interest nearby. Try another interest or a different area.'}${discoveryError?'<button id="retry-places">Try again</button>':''}</div>`;
 renderMarkers();renderDetail();renderTour();
}
function selectPlace(p){state.selected=p;panTo([p.lat,p.lng]);render();if(innerWidth<=720){$('.map-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}
function renderDetail() {
 const card = $('#detail-card');
 const place = state.selected;
 card.hidden = !place;
 if (!place) return;
 const isSaved = saved.some(item => item.id === place.id);
 card.innerHTML = `
  <button class="card-close" id="detail-close" aria-label="Close place details">${icon('close')}</button>
  <div class="detail-category"><span class="place-icon ${esc(place.category)}">${icon(place.category)}</span>${esc(categoryNames[place.category] || 'Place')}</div>
  <h2>${esc(place.name)}</h2>
  <p class="detail-address">${esc(place.address || state.area.name)} · ${distanceLabel(place)}</p>
  ${place.description ? `<p class="detail-description">${esc(place.description)}</p>` : ''}
  ${map ? `<button class="dark-button detail-street-button" type="button" data-open-street>${icon('street')}Open Street View</button>` : ''}
  <div class="detail-actions">
   <a href="${directionsUrl([place])}" target="_blank" rel="noopener noreferrer">${icon('walk')}Walking directions</a>
   <button class="save-button ${isSaved ? 'saved' : ''}" data-save="${esc(place.id)}" aria-pressed="${isSaved}">${icon('bookmark')}${isSaved ? 'Saved' : 'Save place'}</button>
  </div>
  ${marbleLink('places', place.id)}
  <div class="detail-source">Place information from <a href="${safeUrl(place.source)}" target="_blank" rel="noopener noreferrer">${esc(place.sourceLabel || 'the place source')}</a></div>`;
}
function toggleSave(id){const p=state.places.find(p=>p.id===id)||saved.find(p=>p.id===id);if(!p)return;const idx=saved.findIndex(s=>s.id===id);if(idx>=0){saved.splice(idx,1);toast('Removed from your saved places.');}else if(saved.length>=100){toast('Your collection is full. Remove a place before adding another.');return;}else{saved.push(p);toast('Saved for your next little adventure.');}persist();render();}
function endTour(){state.tour=null;state.selected=null;renderWalk();render();}
function startTour(){const stops=state.area.stops?state.area.stops.map(id=>state.places.find(p=>p.id===id)).filter(Boolean):visiblePlaces().sort((a,b)=>distance(a)-distance(b)).slice(0,4);if(!stops.length){toast('Choose a location with nearby places first.');return;}state.tour={stops,index:0};state.selected=stops[0];renderWalk();panTo([stops[0].lat,stops[0].lng]);render();if(innerWidth<=720){$('.map-section').scrollIntoView({behavior:'smooth'});$('#detail-card').hidden=true;}}
function renderTour(){const card=$('#tour-card');card.hidden=!state.tour;if(!state.tour)return;const t=state.tour;card.innerHTML=`<button class="card-close" id="tour-close" aria-label="End neighborhood walk">${icon('close')}</button><span class="eyebrow">YOUR NEIGHBORHOOD WALK</span><h2>${esc(state.area.walkTitle||`A wander around ${state.area.name}`)}</h2><p>These are suggested stops for your walk. Open walking directions for the route.</p><div class="tour-stops">${t.stops.map((s,i)=>`<button class="tour-stop ${i===t.index?'active':''}" data-stop="${i}"><span>${i+1}</span>${esc(s.name)}</button>`).join('')}</div><div class="tour-controls"><button data-tour-prev ${t.index===0?'disabled':''}>Previous</button><span style="font-size:11px">${t.index+1} / ${t.stops.length}</span><button data-tour-next>${t.index===t.stops.length-1?'Finish walk':'Next stop'}</button></div><a href="${directionsUrl(t.stops)}" target="_blank" rel="noopener noreferrer">${icon('walk')}Walking directions in Google Maps</a>`;}
function tourStep(i){if(!state.tour)return;if(i>=state.tour.stops.length){endTour();toast('A little wander, a few new favorites. Explore another place.');return;}state.tour.index=Math.max(0,i);state.selected=state.tour.stops[state.tour.index];panTo([state.selected.lat,state.selected.lng]);render();if(innerWidth<=1100){$('#detail-card').hidden=true;}}
async function api(path,signal){const r=await fetch(path,{signal});const d=await r.json();if(!r.ok)throw new Error(d.error||'This service is temporarily unavailable. Please try again.');return d;}
async function loadLocation(area){endTour();nearbyController?.abort();state.request++;state.area=area;state.center=area.center;state.view='explore';state.category='all';state.error='';state.selected=null;$('#search-results').hidden=true;$('#search-status').textContent='';$('#search-area').hidden=true;panTo(state.center);if(area.id){state.places=curated.filter(p=>p.area===area.id);state.loading=false;render();return;}state.places=[];state.loading=true;render();await loadNearby();}
async function loadNearby(){nearbyController?.abort();nearbyController=new AbortController();const version=++state.request;state.loading=true;state.error='';render();try{const d=await api(`/api/nearby?lat=${state.center[0]}&lng=${state.center[1]}&category=${state.category}`,nearbyController.signal);if(version!==state.request)return;state.places=d.places;state.loading=false;render();}catch(e){if(e.name==='AbortError'||version!==state.request)return;state.loading=false;state.error=e.message;render();}}
async function searchLocation(query){searchController?.abort();const controller=new AbortController();searchController=controller;const button=$('#search-form button');button.disabled=true;$('#search-status').textContent='Finding your starting point…';$('#search-results').hidden=true;try{const d=await api(`/api/search?q=${encodeURIComponent(query)}`,controller.signal);if(controller.signal.aborted)return;const results=d.locations;if(!results.length){$('#search-status').textContent='No location found. Try a city name or a more complete address.';return;}$('#search-status').textContent='Choose a starting point:';$('#search-results').innerHTML=results.map((r,i)=>`<button class="search-result" data-result="${i}">${esc(r.name)}<small>${esc(r.address)}</small></button>`).join('');$('#search-results').hidden=false;$('#search-results').onclick=e=>{const b=e.target.closest('[data-result]');if(b){const r=results[Number(b.dataset.result)];loadLocation({name:r.name,center:[r.lat,r.lng]});}};}catch(e){if(e.name!=='AbortError')$('#search-status').textContent=e.message;}finally{if(!controller.signal.aborted)button.disabled=false;}}
function setView(view){closeStreetView();state.view=view;state.category='all';endTour();}
function closeLayers() {
 $('#layer-options').hidden = true;
 $('#layers-button').setAttribute('aria-expanded', 'false');
 $('#layers-button').focus();
}
function setLayer(layer) {
 if (!map) return;
 mapLayer = layer;
 map.setMapTypeId(layer === 'satellite' ? 'satellite' : 'roadmap');
 const zoom = map.getZoom() ?? neighborhoodZoom;
 map.moveCamera({ tilt: layer === '3d' ? neighborhoodTilt : 0, heading: 0,
  zoom: layer === '3d' ? Math.max(zoom, neighborhoodZoom) : zoom });
 document.querySelectorAll('[data-layer]').forEach(button => {
  button.setAttribute('aria-pressed', String(button.dataset.layer === layer));
 });
 closeLayers();
}
document.addEventListener('click',e=>{const view=e.target.closest('[data-view]');if(view)setView(view.dataset.view);const cat=e.target.closest('[data-category]');if(cat){state.category=cat.dataset.category;state.selected=null;render();if(state.view!=='saved'&&!state.area.id)loadNearby();}const p=e.target.closest('[data-place]');if(p){const place=visiblePlaces().find(x=>x.id===p.dataset.place);if(place)selectPlace(place);}const save=e.target.closest('[data-save]');if(save)toggleSave(save.dataset.save);if(e.target.closest('[data-start-tour]'))startTour();if(e.target.closest('#detail-close')){state.selected=null;render();}if(e.target.closest('#tour-close'))endTour();const stop=e.target.closest('[data-stop]');if(stop)tourStep(Number(stop.dataset.stop));if(e.target.closest('[data-tour-prev]'))tourStep(state.tour.index-1);if(e.target.closest('[data-tour-next]'))tourStep(state.tour.index+1);if(e.target.closest('#retry-places'))loadNearby();const layer=e.target.closest('[data-layer]');if(layer)setLayer(layer.dataset.layer);});
$('#search-form').onsubmit=e=>{e.preventDefault();const q=$('#location-search').value.trim();if(q)searchLocation(q);};
$('#detail-card').addEventListener('click',event=>{
 const button=event.target.closest('[data-open-street]');
 if(button&&state.selected)openStreetView([state.selected.lat,state.selected.lng],button);
});
$('#about-button').onclick=$('#sources-button').onclick=()=>$('#about-dialog').showModal();$('#location-button').onclick=()=>$('#neighborhood-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#search-instead').onclick=()=>{$('#neighborhood-dialog').close();$('#location-search').focus();};
$('#neighborhood-options').innerHTML=neighborhoods.map(a=>`<button class="neighborhood-option" data-area="${a.id}"><img src="assets/${a.image}" alt="${esc(a.alt)}"><span><strong>${esc(a.name)}</strong><small>${esc(a.vibe)}</small></span></button>`).join('');$('#neighborhood-options').onclick=e=>{const a=e.target.closest('[data-area]');if(a){$('#neighborhood-dialog').close();loadLocation(neighborhoods.find(n=>n.id===a.dataset.area));}};
$('#recenter-button').onclick=()=>{panTo(state.center);$('#search-area').hidden=true;};
$('#zoom-in').onclick=()=>{if(map)map.setZoom((map.getZoom() ?? neighborhoodZoom) + 1);};
$('#zoom-out').onclick=()=>{if(map)map.setZoom((map.getZoom() ?? neighborhoodZoom) - 1);};
$('#street-view-button').onclick=event=>openStreetView(mapCenter(),event.currentTarget);
$('#street-view-back').onclick=()=>{
 closeStreetView();
 (streetInvoker?.isConnected ? streetInvoker : $('#street-view-button')).focus({preventScroll:true});
 streetInvoker = undefined;
};
$('#locate-button').onclick=()=>{if(!navigator.geolocation){toast('Location is unavailable. Search a city or address instead.');return;}$('#locate-button').disabled=true;toast('Your browser will ask to use your location.');navigator.geolocation.getCurrentPosition(p=>{$('#locate-button').disabled=false;loadLocation({name:'Around you',center:[p.coords.latitude,p.coords.longitude]});},()=>{$('#locate-button').disabled=false;toast('Location couldn’t be accessed. Search an address or neighborhood instead.');},{timeout:12000,maximumAge:60000});};
$('.map-section').insertAdjacentHTML('beforeend',`
 <button id="search-area" class="search-area dark-button" hidden>${icon('search')}Search this area</button>
 <div class="layer-control">
  <button id="layers-button" class="map-control" aria-label="Choose map layer" aria-expanded="false" disabled>${icon('layers')}</button>
  <div id="layer-options" class="layer-options" hidden>
   <button data-layer="3d" aria-pressed="true">3D buildings</button>
   <button data-layer="flat" aria-pressed="false">Flat map</button>
   <button data-layer="satellite" aria-pressed="false">Satellite</button>
   <button id="traffic-toggle" type="button" aria-pressed="false">Live traffic</button>
  </div>
 </div>`);
$('#search-area').onclick=()=>loadLocation({name:'This area',center:mapCenter()});
$('#layers-button').onclick=()=>{
 const options=$('#layer-options');
 options.hidden=!options.hidden;
 $('#layers-button').setAttribute('aria-expanded',String(!options.hidden));
};
$('#traffic-toggle').onclick=event=>{
 if(!map) return;
 const enabled = !traffic.getMap();
 traffic.setMap(enabled ? map : null);
 event.currentTarget.setAttribute('aria-pressed', String(enabled));
 $('#traffic-status').hidden = !enabled;
 closeLayers();
};
fetch('assets/photo-credits.json').then(r=>r.json()).then(d=>{$('#photo-credits').innerHTML='Neighborhood photographs (cropped to fit):<br>'+d.assets.map(a=>`<a href="${safeUrl(a.sourcePage)}" target="_blank" rel="noopener noreferrer">${esc(a.neighborhood)}</a>: ${esc(a.author)} · <a href="${safeUrl(a.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.license)}</a>`).join('<br>');}).catch(()=>{});
icons();render();
async function initializeMap() {
 fetch('/assets/marble-worlds.json').then(response=>response.ok ? response.json() : null).then(worlds=>{
  if(worlds){marbleWorlds=worlds;render();}
 }).catch(()=>{});
 try {
  await initializeGoogleMap();
 } catch (error) {
  showMapError(error.message || 'The map could not load. Refresh the page to try again.');
 }
 await applyExplorerProfile();
}
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'search_neighborhood',title:'Search a neighborhood',description:'Search for a location and show candidate starting points in the visible explorer.',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:180}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input.query!=='string'||!input.query.trim()||input.query.length>180)throw new Error('Provide a location query of 1–180 characters.');$('#location-search').value=input.query;await searchLocation(input.query);return {message:$('#search-status').textContent};}});}catch{}}

window.patriaExplorer={loadLocation,neighborhoods,categoryNames,applyInterests(interests){state.category=interests.length===1?interests[0]:'all';render();}};
function profileLocation(profile) {
 const savedLocation = profile.location;
 if (typeof savedLocation?.name !== 'string' || !Array.isArray(savedLocation.center)) return null;
 const [lat, lng] = savedLocation.center;
 if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
 return { name: savedLocation.name, center: [lat, lng] };
}
async function applyExplorerProfile() {
 try {
  const profile=JSON.parse(localStorage.getItem('patria-profile:'+(window.patriaUser?.id||'preview'))||'null');
  if(!profile)return;
  if(!new URL(location.href).searchParams.has('area')){
   const startingPoint = profileLocation(profile);
   if(profile.areaId)await loadLocation(neighborhoods.find(n=>n.id===profile.areaId)||neighborhoods[0]);
   else if(startingPoint)await loadLocation(startingPoint);
   else if(profile.placeId)toast('Search again to set your starting point on OpenStreetMap.');
  }
  preferredInterests=(profile.interests||[]).filter(i=>i!=='all'&&categoryNames[i]);
  state.category=preferredInterests.length===1?preferredInterests[0]:'all';
  if(!state.area.id&&state.category!=='all')await loadNearby();
  if(profile.rhythm==='walk')state.view='walks';
  render();
 }catch{}
}
