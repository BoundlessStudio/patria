# Patria Make Me a Walk Builder Plan

Build a planner that helps a Toronto resident turn a free half hour or hour into a walk they can preview and take. Give them one route with two or three worthwhile stops and a clear time estimate. Start with Kensington Market, Trinity Bellwoods, and the Distillery District.

Patria already has curated stops, a MapLibre map with OpenFreeMap tiles, and a 3D preview for routes between two points. Build the planner on those pieces. The pilot uses one named public starting point per neighborhood and a small catalog of reviewed walking loops. [Explorer setup](../README.md), [Existing walk preview](../public/walk-preview.js)

Implement this as the Toronto pilot mode of **Plan a walk** in Phase 2 of the Canadian build plan. Share the planner, ordered stops, route geometry, walking time, and directions handoff. The Toronto mode reads routes from the catalog and adds visit time. The live mode uses the route service and its own duration presets. [Canadian build plan](canada-build-plan.md#phase-2-plan-a-walk-that-fits-the-available-time)

## What the user sees

1. Add **Make me a walk** to the Toronto collection’s walk card in `/preview` and `/explore`. Keep **Explore the walk** as the collection’s preset tour and **Preview a walk** as the point-to-point tool.
2. Show the named start on the map. Offer **30 min**, **45 min**, and **60 min**, with 45 minutes selected by default, and up to two optional interests. Use Patria’s existing categories and give **Bookshops** its own tag so it matches actual bookstores.
3. Where the pilot AI feature is enabled, offer **Describe your walk**. For example, “45 minutes, a bookshop and somewhere green.” The **Apply description** button fills the editable controls for review. **Find a walk** uses the confirmed controls.
4. Show one matching loop with a numbered stop list, a short sourced reason for each stop, the estimated walking time and time at stops, and the return to the starting point. For indoor stops, link to the venue’s hours and label current hours as unverified until Patria has a reliable hours source.
5. Offer **Swap stop** when a valid replacement exists. Keep the other stops in order and recalculate the displayed total from the replacement route. Offer **Preview in 3D** for the whole loop and **Open walking directions in Google Maps** for the handoff.

## Walking routes and time budgets

- Reuse the existing curated place IDs and source links in `public/app.js`. Add planning tags and estimated visit minutes to the same place records. Verify the entrances, stop descriptions, and public start before publishing a loop. Seed at least one qualifying route per time preset in each neighborhood and at least one swappable route pair in each neighborhood.
- Store reviewed loops in a small versioned JSON catalog. Each entry needs a route ID, area ID, start ID, ordered stop IDs, foot-routed GeoJSON `LineString`, walking seconds, distance in meters, routing source, and review date. Generate the path through the ordered coordinates `start → stop 1 → stop 2 → [stop 3] → start` on an approved OSRM foot router. Inspect snapped waypoints for usable entrances or paths. Keep OpenStreetMap attribution and the map correction link visible. The catalog keeps pilot requests off the public FOSSGIS router, which limits usage to one request per second. [OSRM route service](https://project-osrm.org/docs/v5.22.0/api/#route-service), [FOSSGIS usage policy](https://routing.openstreetmap.de/about.html)
- Count the return leg in the routed walking time. Compute the displayed total as walking seconds rounded up to minutes plus the planned visit minutes. Filter to routes that include every selected interest and fit within the chosen total. Select the closest fit under the limit and use a stable catalog order to break ties. Label the total as an estimate and show spare time when there is a substantial gap.
- A swap must match the original start, all selected interests, the same ordered stop list except for the replacement, and the original budget. If the available loops cannot satisfy the request, keep the current controls and suggest a specific adjustment supported by the catalog, such as adding time or changing an interest.
- Feed the full routed line into the existing 3D playback and fit the overview to the whole loop. Show a single start and finish marker. Use the existing Google Maps link helper with the same start and destination and the stops in order as waypoints. Provide directions to the next stop as well for clients that skip waypoints. Google Maps calculates its own directions, so show Patria’s estimate on the plan and test the handoff on desktop and mobile. [Maps URLs directions](https://developers.google.com/maps/documentation/urls/get-started#directions-action)

## AI request and fallback

Add a same-origin `POST /api/walk/intent` handler in `worker/api.mjs` for verified Sites users. Handle it before the GET-only check for the existing endpoints. Accept `{ "prompt": "…" }` with a single typed request of up to 240 characters. Use one server-side call to a configured model with strict structured output. An OpenAI Responses adapter with `store: false` is the proposed default. Return validated settings only. The browser uses the same catalog picker for typed requests and preset controls. [Worker API](../worker/api.mjs), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

```json
{
  "durationMinutes": 45,
  "interests": ["books", "parks"],
  "reviewRequired": false
}
```

- Accept `30`, `45`, `60`, or `null` for duration and up to two allowed interest IDs or `null` for interests. A `null` field keeps the existing choice. An empty interest array selects any interest. Set `reviewRequired` for unsupported requests, such as a custom starting address, a different finish, an exact opening time, or step-free routing. Require the user to confirm the supported controls before selecting a route. Stop selection, time, geometry, and place facts come from the catalog and application code.
- Send only the submitted text and parsing instructions to the model. Tell users to leave personal addresses out of the prompt. Keep provider credentials in runtime secrets, cap usage for the pilot, and keep prompts out of Patria logs and browser storage. Update the privacy copy to identify the provider and explain what it receives.
- Gate the text prompt on verified sign-in, model configuration, and a pilot feature flag. On timeout, rate limit, invalid output, or provider error, keep the user’s current settings and offer the preset controls. Cancel or disregard a response if the user changes neighborhoods, edits the controls, or closes the planner. The local public preview can exercise the full planner from the catalog, and mocked requests cover the model path.

## Build and acceptance order

| Milestone | Acceptance check |
| --- | --- |
| 1. Catalog and picker | Verify all three neighborhoods and presets. A 30-minute budget accepts a route with 20 minutes walking and 10 minutes at stops, and rejects one with 20 minutes and 1 second walking and 10 minutes at stops. Test missing interest matches and broken catalog references. |
| 2. Planner and preview | Start from `/preview?area=trinity` and from hosted `/explore`. The result shows the same stop order on the map, in the list, and in the directions link. A swap fits the original budget. Closing the preview restores the plan and focus. Check keyboard controls, a narrow phone viewport, reduced motion, and a usable stop list if the map fails. |
| 3. Optional text input | The example resolves to 45 minutes, Bookshops, and Green spaces. Unsupported constraints require review. Invalid or unauthenticated requests fail before a model call. Newer edits take precedence over a late model response. The catalog planner works with the model disabled. |
| 4. Pilot release | Run `npm test` and `npm run build` from `explorer`. Smoke-test the deployed Worker with real Sites sign-in and the pilot model enabled. Verify the preset tour, point-to-point preview, and existing saves alongside the new planner. |

## Pilot and follow-on releases

Use a small resident pilot to compare the current preset tour with the new planner. Record how often participants open directions, ask whether they took the walk, and check whether they come back for another within two weeks. Give some participants preset controls and others controls plus text. Keep the text option if median time to a plan participants would take falls and the rate of time or interest corrections holds steady or falls. Record the observed outcomes and omit prompts and exact personal locations from the pilot notes.

1. **Build around a saved place.** Add a start-from-saves action that selects a loop containing an eligible bookmarked stop. Match against the catalog by ID and keep existing Google place saves available as external links.
2. **What’s the story here?** Add short, reviewed stories to selected stops using venue, city, or neighborhood sources. Link each story to its source and test the text on real walks before adding audio. [Toronto Cultural Hotspot Tours](https://www.toronto.ca/explore-enjoy/festivals-events/cultural-hotspot/cultural-hotspot-tours/)
