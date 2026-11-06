# Patria

A neighborhood explorer for anyone curious about the life around them, with OpenStreetMap, muted 3D buildings, and animated street-level walks.

The application lives in `explorer/`.

```sh
cd explorer
npm run dev
```

Open `http://127.0.0.1:4173`. No dependency installation is needed. Sign-in uses the hosted Sites platform; the local preview provides an explicitly labeled onboarding preview.

- [Explorer setup and map sources](explorer/README.md)
- [Reference research and experience decisions](explorer/docs/experience-research.md)
- [Original illustration prompts](explorer/artwork/imagegen-prompts.txt)
- [Google Maps and world models lab](explorer/docs/google-setup.md)

The live map uses OpenFreeMap, and signed-in location search and discovery use Photon. Zoom in for simulated traffic on mapped roads, railways, and ferry routes. Satellite imagery and walking directions open in Google Maps.

```sh
cd explorer
npm test
npm run build
```

The build emits a Cloudflare Worker at `dist/server/index.js` with public assets embedded. Photon lookups run on the server. Preferences and saved places remain on the device.
