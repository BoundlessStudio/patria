const eventState = { radius: 1200, window: '7d', events: [], status: 'start', refresh: 'ready' };
let eventRequest, eventPoll;

function cancelEventRequest() {
  eventRequest?.abort();
  clearTimeout(eventPoll);
}

async function loadEvents({ background = false, remainingPolls = 3 } = {}) {
  if (state.view !== 'events' || !state.hasStart) return;
  cancelEventRequest();
  const controller = new AbortController();
  eventRequest = controller;
  if (!background) {
    eventState.events = [];
    eventState.status = 'loading';
    eventState.refresh = 'ready';
    state.selected = null;
    render();
  }
  const [lat, lng] = state.center;
  const params = new URLSearchParams({ lat, lng, radius: eventState.radius, window: eventState.window });
  try {
    const data = await api(`${localEventsPreview ? '/api/local' : '/api'}/events/nearby?${params}`, controller.signal);
    if (controller.signal.aborted || state.view !== 'events') return;
    eventState.events = data.events;
    eventState.refresh = data.refresh;
    eventState.status = data.events.length ? 'results' : 'empty';
    if (data.refresh === 'checking' && remainingPolls > 0) {
      eventPoll = setTimeout(() => loadEvents({ background: true, remainingPolls: remainingPolls - 1 }), 4000 * (4 - remainingPolls));
    }
  } catch (error) {
    if (controller.signal.aborted || state.view !== 'events') return;
    eventState.status = eventState.events.length ? 'results' : 'error';
    eventState.refresh = 'partial';
    eventState.error = error.message;
  }
  render();
}

function eventDate(session, timezone) {
  const dateOnly = session.kind !== 'timed';
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: dateOnly ? 'UTC' : timezone, weekday: 'short', month: 'short', day: 'numeric',
    ...(dateOnly ? {} : { hour: 'numeric', minute: '2-digit' }),
  });
  const start = format.format(new Date(session.start));
  if (session.kind === 'run') return `${start} to ${format.format(new Date(session.end))} · Check visiting hours`;
  if (dateOnly) return `${start} · Check listing for time`;
  return start + (session.end ? ` to ${format.format(new Date(session.end))}` : '');
}

function sessionLinks(session) {
  const [primary, ...others] = session.sources;
  if (!primary) return '';
  const link = (url, label) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  return `<div class="event-links">${link(primary.url, `Listing · ${primary.publisher}`)}
    ${primary.bookingUrl && primary.bookingUrl !== primary.url ? link(primary.bookingUrl, 'Booking') : ''}
    ${others.map(source => link(source.url, source.publisher)).join('')}
  </div>`;
}

function venueActions(venue) {
  const panorama = googleMapLink('/maps/@', { map_action: 'pano', viewpoint: `${venue.lat},${venue.lng}` });
  return `<div class="event-links">
    <a href="${esc(directionsUrl([venue]))}" target="_blank" rel="noopener noreferrer">Directions</a>
    ${mapLayer ? `<button type="button" data-event-street="${esc(venue.id)}">Street View</button>`
      : `<a href="${esc(panorama)}" target="_blank" rel="noopener noreferrer">Street View</a>`}
  </div>`;
}

function eventCard(event) {
  const { venue, sessions, distanceMeters } = event;
  const distance = distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`;
  return `<article class="event-card" id="event-${esc(event.id)}" tabindex="-1">
    <p class="event-card-date">${esc(eventDate(sessions[0], venue.timezone))}</p>
    <h3>${esc(event.title)}</h3>
    <p>${esc(venue.name)} · ${esc(distance)} away</p>
    ${venue.address ? `<p class="event-address">${esc(venue.address)}</p>` : ''}
    ${sessionLinks(sessions[0])}
    ${sessions.length > 1 ? `<details><summary>See all ${sessions.length} dates and times</summary>
      <ul>${sessions.map(session => `<li>${esc(eventDate(session, venue.timezone))}${sessionLinks(session)}</li>`).join('')}</ul></details>` : ''}
    ${venueActions(venue)}
    ${marbleLink('events', event.id) || marbleLink('venues', venue.id)}
  </article>`;
}

function renderEventsPanel() {
  const status = $('#event-status'), cards = $('#event-cards');
  $('#event-filters').hidden = !state.hasStart;
  $('#event-preview-label').hidden = !localEventsPreview;
  $('#event-radius').value = eventState.radius;
  $('#event-window').value = eventState.window;
  if (eventState.status === 'start') {
    status.textContent = 'Search for a Canadian address, use your location, or zoom in and choose an area on the map.';
  } else if (eventState.status === 'loading') {
    status.textContent = 'Finding dated events and activities nearby…';
  } else if (eventState.status === 'error') {
    status.textContent = eventState.error || 'The event index is temporarily unavailable.';
  } else {
    const count = eventState.events.length;
    const results = count ? `${count} ${count === 1 ? 'event' : 'events'} near this pin.` : 'No verified events match this pin and date range.';
    status.textContent = `${results}${eventState.refresh === 'checking' ? ' Checking local sources…'
      : eventState.refresh === 'partial' ? ' Some local sources could not be checked.' : ''}`;
  }
  cards.innerHTML = eventState.events.map(eventCard).join('');
  $('#event-retry').hidden = !(eventState.status === 'error' || eventState.refresh === 'partial' || eventState.refresh === 'checking');
  $('#event-widen').hidden = eventState.status !== 'empty' || eventState.radius === 5000;
  $('#event-widen').textContent = eventState.radius === 1200 ? 'Search within 2.5 km' : 'Search within 5 km';
}

function eventMapVenues() {
  return [...new Map(eventState.events.map(event => [event.venue.id, event.venue])).values()];
}

function selectEventVenue(venue) {
  state.selected = venue;
  renderMarkers();
  renderEventVenue();
}

function renderEventVenue() {
  const card = $('#detail-card'), venue = state.selected;
  card.hidden = !venue;
  if (!venue) return;
  const events = eventState.events.filter(event => event.venue.id === venue.id);
  card.innerHTML = `<button class="card-close" id="detail-close" aria-label="Close venue details">${icon('close')}</button>
    <h2>${esc(venue.name)}</h2><p>${esc(venue.address || venue.city)}</p>
    <ul class="event-venue-list">${events.map(event => `<li><button type="button" data-event-card="${esc(event.id)}">${esc(event.title)}</button></li>`).join('')}</ul>
    ${venueActions(venue)}${marbleLink('venues', venue.id)}`;
}

function installEventControls() {
  $('#event-radius').onchange = event => { eventState.radius = Number(event.target.value); loadEvents(); };
  $('#event-window').onchange = event => { eventState.window = event.target.value; loadEvents(); };
  $('#event-retry').onclick = () => loadEvents();
  $('#event-widen').onclick = () => { eventState.radius = eventState.radius === 1200 ? 2500 : 5000; loadEvents(); };
  document.addEventListener('click', event => {
    const street = event.target.closest('[data-event-street]');
    if (street) {
      const venue = eventMapVenues().find(item => item.id === street.dataset.eventStreet);
      if (venue) openStreetView([venue.lat, venue.lng], street);
    }
    const card = event.target.closest('[data-event-card]');
    if (card) document.getElementById(`event-${card.dataset.eventCard}`)?.focus();
  });
}
