# Patria verification

## Claims and states to verify

- Public home: white header, readable hero copy, distinct roads bordering the park, open greenery at the footer’s left edge, fade from white at the top.
- Responsive home and explorer: desktop and narrow phone, no missing image assets or horizontal overflow.
- Sign-in entry: native platform handoff; local preview explicitly identifies its preview status. Protected routes cannot skip authentication.
- Onboarding: required starting location, back/next navigation, multiple interests, chosen exploration pace, persisted preferences applied to explorer.
- Explorer: curated neighborhood changes, category filters including empty results, place details, save/unsave and reload, tour next/previous/finish, correct Google handoff URLs.
- Google integration: API contract, identity gate, validation, secrets, field masks, upstream failure and rate limit. Live Google map, Places and panoramas require the owner’s keys.
- Documents: Google setup, privacy, terms, source and photo credits reachable.
- Adverse states: missing Google configuration; empty saved list; invalid search; no matching category; protected deep link.

## Results

API tests: 10 passed (Node test runner). Google responses were mocked for contract tests; no live Google credentials are configured.

Browser checks passed at 1440 × 980 and 390 × 844: no horizontal page overflow, all home images decoded, readable hero/footer, and the footer overlay fades from white at the top. The nearby left houses were removed from the artwork.

The local sign-in entry identifies itself as a preview. Onboarding’s required location, back navigation, multiple interests and pace were exercised. Trinity/coffee/parks/walk and Distillery/coffee/street choices carried through after navigation. Profile preferences and saved places persisted after reload; Google IDs are stored separately from researched curated objects and scoped per platform user.

Explorer checks passed: save/unsave, empty collection, no matching category, neighborhood change, correct Street View URL parameters, three-stop walk next/previous/finish, and mobile tour visibility. Search without keys displays its setup message. Protected deep links redirect to platform sign-in. The setup, privacy, terms, credits and revised image URLs returned HTTP 200. Keyboard Tab exposes the skip link and Enter focuses the wizard content. No browser console errors were observed.

Build passed: Cloudflare-compatible Worker with embedded assets. The server/API tests passed all 10 cases. Platform sign-in is implemented through native Sites dispatch and is not available in the standalone local server. Live Google calls and panoramas were not exercised because no keys are configured. WebMCP is feature-detected; the test browser does not expose document.modelContext.

Screenshots are retained in the workspace’s ignored .playwright-mcp directory.

