# Patria maps and world models lab

Patria's explorer uses OpenStreetMap geometry, OpenFreeMap tiles, Photon place search, and FOSSGIS walking routes. Its third-person walk renders solid muted buildings. OpenStreetMap features place the bicycle racks, bins, and transit stop poles. The [map sources page](https://patria.rgbknights.com/setup) credits the street photo used for sidewalk and curb reference.

## Google Maps comparison

Use the existing **patria** Google Cloud project. Evaluate Google services together in a separate Google map. Google's standard terms restrict deriving street geometry, object indexes, or training data from its imagery. [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms)

| Service | Lab use |
| --- | --- |
| Maps JavaScript API | Vector roadmap with a cloud style and Map ID, Satellite mode, and Street View panoramas in a Google map |
| Places API (New) | Place lookup and nearby search with a minimal field mask |
| Geocoding API | Address-to-coordinate and reverse address lookup |
| Geolocation API | Approximate positioning from network data for clients without usable GPS |
| Map Tiles API | Separate display experiments with satellite, Street View, and Photorealistic 3D tiles |

Cloud styling controls colors and visibility for map features such as buildings, roads, parks, and water. Panorama photos retain their original appearance. Keep the browser key website-restricted to the lab origin and API-restricted to its client services. Use separately scoped server credentials for server-side requests. [Cloud map styling](https://developers.google.com/maps/documentation/javascript/cloud-customization) [Key restrictions](https://developers.google.com/maps/api-security-best-practices)

Street View Insights is a separate offering for statistical analysis of assets such as street signs and utility poles. Its access and use terms are distinct from the Maps JavaScript and Map Tiles APIs. [Street View Insights](https://developers.google.com/maps/documentation/street-view-insights/overview)

## Open imagery and live traffic

| Source | Where it fits |
| --- | --- |
| [Mapillary](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data) and [KartaView](https://kartaview.org/terms) | Street-level reference for sidewalk materials and furniture. Verify captures along each route and credit contributors under the applicable licence. |
| [OpenAerialMap](https://openaerialmap.org/about/) | Openly licensed aerial reference where there is recent, sufficiently detailed coverage. |
| [HERE Traffic Flow](https://docs.here.com/traffic-api/docs/flow) and [TomTom Traffic Flow](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/vector-flow-tiles) | Live speed and congestion by road segment. A lab can compare confidence, road matching, and coverage across Toronto, Montréal, Calgary, and Vancouver. Historical counts remain the baseline for vehicle density. |

## World models

- **World Labs Marble** accepts images, video, or text and can export a persistent scene as a Gaussian splat, with a collider mesh for navigation. It is a candidate for a small, separately rendered street scene. [World API](https://docs.worldlabs.ai/api) [Export format](https://docs.worldlabs.ai/api/reference/worlds/export)
- **Google DeepMind Genie 4** is an interactive world model in research preview. Use it to evaluate motion and scene feel when access is available. Google documents limitations in geographic accuracy and consistency over time. [Genie 4](https://deepmind.google/models/genie/)

Start with a single block of Kensington Avenue. Use a Patria render as the starting composition and add open or owner-captured references with suitable rights. Compare the resulting scene with the same OpenStreetMap route and walker. Check whether sidewalks and turns stay aligned, whether the chase camera stays clear of buildings, and whether the scene loads smoothly on a phone. Use mapped coordinates for the walk and label generated details as illustrative.
