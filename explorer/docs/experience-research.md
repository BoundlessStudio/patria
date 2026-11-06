# Patria experience research

## What the reference does

[Mirai](https://heymirai.ai/) currently presents neighborhood tours as an extension of a property listing. Its core activities are exploring streets, finding everyday places, examining routes, and shaping a neighborhood story around personal interests. Its public home page moves from a warm illustrated introduction to preview, process, features, and use cases. The site emphasizes agents, brokerages, developers, and buyers.

## What changes for Patria

The starting point becomes curiosity rather than a home purchase. A resident can rediscover familiar streets; a visitor can get a feel for an unfamiliar area; someone moving can still explore without being the only intended audience.

| Mirai’s property journey | Patria’s exploration journey |
| --- | --- |
| Listing address | Any neighborhood, city, or address |
| Picture life around a potential home | Discover what is interesting nearby |
| Household and moving questions | Starting point, interests, and exploration style |
| Tour shared by an agent | Experience started by the explorer |
| Marketing and buyer decisions | A map, a street-level look, and a walk to try |

## Implemented journey

1. **Home:** Original painted hero and footer scenes introduce the experience. Visitors can learn the process or preview three Toronto collections.
2. **Sign-in:** Sites’ verified authentication establishes identity before the onboarding and paid place endpoints.
3. **Wizard:** Choose a location, pick interests, and choose a map, street, or walk emphasis. Preferences remain on the device.
4. **Explorer:** A light Google map sits inside a white GIS interface with search, boxed controls, layers, place details, and saved places.
5. **Street level:** A place opens the map’s Google Street View. Missing imagery has an explicit failure state. Google Maps links also provide a cross-device handoff.
6. **A walk:** Suggested stops are connected with a dotted sequence. Actual walking directions open in Google Maps; the sequence is not represented as verified pedestrian routing.

## Data and visual decisions

Google is the sole mapping and discovery provider. Places Text Search supports location lookup; Nearby Search returns places within a bounded radius; Place Details refreshes saved IDs. Google Places content stays on Google maps, and only Google place IDs are retained in browser storage. [Google Places policy](https://developers.google.com/maps/documentation/places/web-service/policies)

The home illustrations are original AI artwork, not geographic evidence. Toronto photography is factual and licensed, with credits in the site. Curated place descriptions link to the tourism, municipal, or business pages that support them. No ratings, live crowds, live weather, opening status, or accessibility guarantees are invented.

## Sources behind the Toronto preview

- [Destination Toronto: Kensington Market](https://www.destinationtoronto.com/neighbourhoods/westside/kensington-market/)
- [FIKA Café](https://www.fika.ca/)
- [City of Toronto: Kensington heritage plan](https://www.toronto.ca/legdocs/mmis/2025/te/bgrd/backgroundfile-251646.pdf)
- [City of Toronto: Bellevue Square Park](https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=263&title=Bellevue-Square-Park)
- [City of Toronto: Trinity Bellwoods](https://www.toronto.ca/city-government/planning-development/construction-new-facilities/park-facility-projects/trinity-bellwoods-park-access-circulation-study/)
- [TYPE Books](https://typebooks.ca/)
- [White Squirrel Coffee](https://whitesquirrelcoffee.com/?page_id=5382)
- [Distillery District](https://www.thedistillerydistrict.com/)
- [Corkin Gallery](https://www.corkingallery.com/)
- [SOMA](https://www.somachocolate.com/pages/tastings)
- [Soulpepper / Young Centre](https://soulpepper.ca/)

## Current limits

The Google project and keys still need configuration before the live map, worldwide search, and integrated panoramas can be exercised against Google. Until then the home page, onboarding preview, researched Toronto place cards, saved collection, and Google Maps links can be reviewed. Sign-in is platform-owned and runs on the hosted Site, not the standalone local server. Saved places and preferences do not synchronize across devices.

Research date: October 5, 2026.
