# Patria Happening nearby

Patria finds verified events and activities near a Canadian starting point. The signed-in explorer defaults to 1.2 km and seven venue-local calendar days. Toronto guest previews show curated places.

## Run locally

Use Node 22.13 or later. Run from the explorer directory.

```sh
npm ci
npm run events:seed
npm run events:refresh
npm run events:report
npm test
npm run build
npm run dev
```

Open [the local event preview](http://127.0.0.1:4173/preview?events=1). The loopback preview uses the local SQLite index. Hosted event searches use Sites sign-in. Set `GOOGLE_MAPS_BROWSER_KEY` in `.env` for the map. Search and event cards also work in the list.

## Source operations

The seed command imports the [original registry](data/experience-sources.json) and the [expansion](data/experience-sources-additional.json). The refresh command reads live listings. Dated registry examples document prior research. SQLite data lives in `.events/index.sqlite`.

```sh
npm run events:refresh -- --cohort additional --limit 25
npm run events:refresh -- --source nanaimo-museum --force
npm run events:discover -- --lat=49.165002 --lng=-123.936467
npm run events:nearby -- --lat=49.165002 --lng=-123.936467 --window=7d
```

The operator report shows publisher coverage, access, last fetch, next check, verified occurrences, and items held for review. An additional source qualifies after a verified current occurrence and a successful repeat fetch. Public subscriptions and open datasets supply most activity data. Patria stores basic listing facts, links to the publisher, and follows fetch restrictions.

The optional `PATRIA_BRAVE_SEARCH_KEY` enables Brave web discovery. `PATRIA_EVENTS_SEARCH_URL` can point to a compatible HTTPS provider returning result URLs. Publisher links can yield calendars without a search key. `PATRIA_PHOTON_URL` can point to an instance sized for production lookup. The Canadian location service provides a fallback. Set `PATRIA_EVENTS_GEOCODE=off` to restrict ingestion to published or already verified venue coordinates.

## Hosted refresh

The Sites build packages the Worker and D1 migrations for the `EVENTS_DB` binding. Configure `PATRIA_EVENTS_OPERATOR_ID` from the verified Sites identity of the operator. The linked Sites task calls `refresh_events` until `remainingDue` is zero and reads `event_source_report` for the result. An operator can pass `verifyRepeat: true` to check newly verified additions a second time. A trusted server can also POST JSON-RPC `tools/call` to `/api/events/maintenance` with the `X-Patria-Events-Token` header. Configure its value as the `PATRIA_EVENTS_OPERATOR_TOKEN` runtime secret.

See the [live release checks](docs/happening-nearby-release.md) and the [map and Marble setup](docs/google-setup.md).
