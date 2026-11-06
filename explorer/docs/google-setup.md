# Patria maps and Marble scenes

## Google Maps

The explorer loads the Google Maps JavaScript vector map with the Patria Lab Muted cloud style. Use the layer menu for the tilted 3D roadmap, a flat view, satellite imagery, or live traffic. Street View opens Google's native panorama from the map center or a place card. Pegman shows imagery coverage and lets you choose a street. [Map building styles](https://developers.google.com/maps/documentation/javascript/cloud-customization/building-style) [Street View](https://developers.google.com/maps/documentation/javascript/streetview)

The Patria Browser key in `patria-510720` is limited to Maps JavaScript and Patria's two hosted origins and loopback development URLs. Sites supplies `GOOGLE_MAPS_BROWSER_KEY` at runtime. For local development, put it in `.env`. The style lives on the Patria Lab vector Map ID in `patria-513913`. Set `GOOGLE_MAPS_MAP_ID` to override that ID. The Worker returns only these public browser settings to the explorer.

Photon supplies independent location search and nearby places from OpenStreetMap. Suggested walks link to Google Maps for directions. Live traffic colors show current road conditions where Google has coverage. Historical traffic counts are available in `data/traffic/`. [Map sources](https://patria.rgbknights.com/setup) [Traffic layer](https://developers.google.com/maps/documentation/javascript/trafficlayer)

## Create a Marble scene

Keep Google map tiles, Street View imagery, and Places content in the Google experience. Google Maps Platform terms restrict using them to build derivative scenes or as AI inputs. Build the scene brief from independent sources such as OpenStreetMap geometry, municipal open data, your own street photos, and openly licensed street or aerial imagery. Review each media licence against World Labs' input terms and keep its attribution with the scene. [Google Maps terms](https://cloud.google.com/maps-platform/terms) [World Labs terms](https://www.worldlabs.ai/terms-of-service)

Look for street coverage on KartaView and Mapillary. OpenAerialMap has openly licensed aerial imagery where coverage is available. [KartaView terms](https://kartaview.org/terms) [Mapillary imagery licence](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data) [OpenAerialMap licence](https://openaerialmap.org/about/)

The [Kensington walk manifest](../data/marble/kensington-walk.json) is a text draft based on independent references. Source pages are kept as credits. To send media, set a source's `use` to `image`, `panorama`, or `video`, supply a fetchable `mediaUrl` or previously uploaded `mediaAssetId`, and mark `rightsReviewed` only after checking permissions. Several images should show the same scene. Add `azimuth` in degrees when known. For an individual location, use `collection: "places"` and its Patria place ID as the target. [Marble input examples](https://docs.worldlabs.ai/api/world-generation-examples)

```sh
node scripts/generate-marble.mjs plan data/marble/kensington-walk.json
node --env-file=.env scripts/generate-marble.mjs submit data/marble/kensington-walk.json
node --env-file=.env scripts/generate-marble.mjs status YOUR_OPERATION_ID
```

The plan command prints the request locally. Submitting uses World Labs credits and requires `WLT_API_KEY` in the local `.env`. It creates a private world. Save the operation ID and check its status to retrieve the world ID and Marble link. [World API quickstart](https://docs.worldlabs.ai/api)

Review walkability, geography, source credits, and mobile performance in Marble. After approving and sharing a world, add its ID and source credits under the target in `public/assets/marble-worlds.json`. Patria shows **Explore in Marble** only for cataloged scenes.

```json
{
  "walks": {
    "kensington": {
      "id": "REVIEWED_WORLD_ID",
      "sources": [
        { "url": "https://www.openstreetmap.org/copyright", "credit": "OpenStreetMap contributors", "license": "ODbL 1.0" }
      ]
    }
  },
  "places": {}
}
```
