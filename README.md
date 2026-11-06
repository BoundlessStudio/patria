# Patria

A neighborhood explorer with Google's photorealistic 3D map, native Street View, and suggested walks.

The application lives in `explorer/`.

```sh
cd explorer
npm run dev
```

Open `http://127.0.0.1:4173`. No dependency installation is needed. Sign-in uses the hosted Sites platform; the local preview provides an explicitly labeled onboarding preview.

- [Explorer setup and map sources](explorer/README.md)
- [Reference research and experience decisions](explorer/docs/experience-research.md)
- [Original illustration prompts](explorer/artwork/imagegen-prompts.txt)
- [Google Maps setup and Marble scene workflow](explorer/docs/google-setup.md)

Use the layers menu for the muted Patria styled map, a flat map, overhead satellite imagery, or live traffic. Signed-in location search and discovery use Photon and OpenStreetMap. Set the browser key in `explorer/.env` for local maps.

```sh
cd explorer
npm test
npm run build
```

The build emits a Cloudflare Worker at `dist/server/index.js` with public assets embedded. Photon lookups run on the server. Preferences and saved places remain on the device.
