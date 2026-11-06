# Patria neighborhood explorer

A welcoming home page, platform sign-in, three-step onboarding, and an OpenStreetMap explorer with muted 3D buildings.

Run locally with `node serve.mjs` and open http://127.0.0.1:4173. No packages need to be installed. The explicit local preview route is /preview; /preview?wizard=1 reviews the onboarding flow.

OpenFreeMap serves the vector map, and Photon provides search and nearby places on the hosted Site after sign-in. The map and search work without API keys. Set `PATRIA_PHOTON_URL` to use another Photon instance. Satellite imagery and walking directions open in Google Maps.

Use **Preview a walk** to choose two neighborhood points and follow a pedestrian route through the 3D buildings. Foot routes come from FOSSGIS by default. Set `PATRIA_WALK_ROUTER_URL` to use another OSRM server configured with the foot profile.

At close zoom, animated traffic follows mapped roads, tracks, and ferry routes. `node scripts/update-traffic-counts.mjs` refreshes the bundled traffic volume samples from the official sources listed at `/setup#traffic`.

- [Original prototype research](docs/experience-research.md)
- [Original prototype verification](docs/qa.md)
- [Illustration prompts](artwork/imagegen-prompts.txt)

Run `node --test worker/api.test.mjs` for API checks and `node scripts/build.mjs` for the deployable Worker.
