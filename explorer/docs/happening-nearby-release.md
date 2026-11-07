# Happening nearby live checks

On November 6, 2026, the local Patria index tracked 259 curated publishers, including 159 additions. Of the additions, 106 returned a current verified occurrence and passed a repeat refresh. The report also tracked discovered publishers and recorded sources that need an adapter, credentials, approval, or another attempt.

The hosted D1 index verified and repeat-refreshed **116 additional publishers**. The first hosted pass processed 245 due sources through the operator-authorized writer. A second hosted pass processed 116 qualifying additions, and the operator report confirmed the persisted total. The linked Sites task runs daily at 4:00 a.m. Toronto time.

These checks used a 1,200 m radius and the next seven venue-local calendar days. Counts are event cards, with repeat sessions grouped within each card.

| Market | Public pin | Coordinates | Local cards | Hosted cards | Local example |
| --- | --- | --- | ---: | ---: | --- |
| Nanaimo | Nanaimo Museum | 49.165002, −123.936467 | 3 | 3 | [Juried Fine Art Show](https://nanaimoartscouncil.ca/event/juried-fine-art-show-2/) |
| Saskatoon | Remai Modern | 52.12306, −106.66755 | 6 | 3 | [Modern Artmakers](https://www.remaimodern.org/events-gatherings/modern-artmakers/2026-11-07/) |
| Sherbrooke | Le Croquarium | 45.3856495, −71.9192781 | 1 | 1 | [Cours de cuisine](https://diabete-estrie.ca/evenement/cours-de-cuisine-pour-adultes-vivant-avec-le-diabete-type-1-ou-type-2-3/) |
| Moncton | Resurgo Place area | 46.0933, −64.7765 | 7 | 0 | [eat make share](https://www.moncton.ca/en/things-do/events/calendar/eat-make-share-a-taste-immigration) |
| Whitehorse | Whitehorse Public Library | 60.724512, −135.0526189 | 6 | 6 | [Science Saturdays](https://yukonlibraries.ca/event/17539951) |

The hosted Moncton check returned a partial-results state. The hosted signed-in browser check also confirmed Nanaimo’s event cards, venue marker, directions link, Street View, and return to the map.

An event lookup near Nanaimo Museum queued discovery. Patria followed links from a public arts directory and found the Nanaimo Arts Council outside both curated sets. It saved the publisher, verified eight occurrences, and verified eight again on repeat refresh. [Directory](https://www.nanaimofca.com/links) · [Publisher calendar](https://nanaimoartscouncil.ca/event_calendar/)

The local browser check covered desktop and 390 px layouts, location permission denied, Nanaimo address search, rapid filter changes, restored starts, and a Toronto guest preview. Run `npm run events:report` for the current source counts and `npm run events:nearby` to check a pin.
