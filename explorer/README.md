# Patria neighborhood explorer

Patria pairs Google Photorealistic 3D and native Street View with neighborhood discovery and suggested walks.

Run `npm run dev` and open http://127.0.0.1:4173/preview. Set `GOOGLE_MAPS_BROWSER_KEY` in the local `.env` to load the map. The onboarding preview is /preview?wizard=1.

Signed-in location search and nearby places use Photon and OpenStreetMap. Set `PATRIA_PHOTON_URL` to use another Photon instance. Suggested walks open Google walking directions. Published Marble scenes appear on the matching walk or place card.

- [Google Maps setup and the Marble generation workflow](docs/google-setup.md)
- [Map and traffic sources](https://patria.rgbknights.com/setup)

Run `npm test` for API checks and `npm run build` for the deployable Worker.
