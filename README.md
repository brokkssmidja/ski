# World Cup

Next FIS Alpine and Cross-Country World Cup race, in Eastern Time, for Lake Placid.

Static site. Open `index.html` or serve the folder. Android can install it from the browser: the manifest scope is `/ski/`, and the service worker caches the page for offline use.

Alpine, Cross-country, Men, and Women are separate chips. They combine, and the choice is kept in `localStorage` (`ski-filters`). Upcoming races sit under Today, This weekend, then the date or the week. Slalom and giant slalom show run 1 and run 2 together, in Eastern Time. Add to calendar downloads an `.ics` file for that race. A start time that is still TBA is an all-day event.

`contenders.js` is the list of Swedish, US, and Norwegian skiers to highlight. Edit the names there. Each block is one sport, gender, and discipline. Cross-country blocks use `sprint`, `distance`, or `relay` instead of every distance string.

## Pages

The site is meant to be served at [https://brokkssmidja.github.io/ski/](https://brokkssmidja.github.io/ski/). Page assets are relative, so they resolve under `/ski/`. The manifest `scope` and `start_url` are `/ski/`.

Publishing has to be turned on in the repository settings. From this repo that is:

1. Open **Settings → Pages** ([github.com/brokkssmidja/ski/settings/pages](https://github.com/brokkssmidja/ski/settings/pages)).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

`.github/workflows/pages.yml` deploys the repository root on every push to `main`. The first run can sit at **Review deployments** until the `github-pages` environment is approved: **Actions → Deploy GitHub Pages → Review deployments → Approve and deploy**.

If **GitHub Actions** is not in the source list, use **Deploy from a branch**, branch **main**, folder **/ (root)**. The files already live at the root.

## Schedule

`races.json` is the 2026/27 World Cup for alpine (women and men, all disciplines) and cross-country (women, men, and the mixed relay). World Championships are not World Cup races and are not listed.

- Alpine dates: [World Cup calendar PDFs](https://www.fis-ski.com/alpine-skiing/documents) (women 17 Jul 2026, men file linked from that page).
- Cross-country dates: [Cross-Country World Cup Calendar 2026/27](https://www.fis-ski.com/cross-country/documents).
- Start times: FIS database calendar, season 2027, category World Cup ([alpine](https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?sectorcode=AL&seasoncode=2027&categorycode=WC), [cross-country](https://www.fis-ski.com/DB/cross-country/calendar-results.html?sectorcode=CC&seasoncode=2027&categorycode=WC)), via the public iCal feed. `Run 1 loc` / `Run 2 loc` are venue local time and are stored as UTC. European clocks fall back on 25 Oct 2026, so Sölden women (24 Oct, still CEST) and Sölden men (25 Oct, CET) are converted with that change. US venues use Mountain or Eastern time, including the November fallback and the March return to daylight time.

Narvik (women’s downhill and super-G, 12–13 Mar 2027) is on the women’s calendar as venue TBC and is not yet a timed row in the database, so those clocks are null. Cross-country rows in the database are dates without a start clock, so they are null too. The page shows **Time TBA** for a null time.

Sprint qualification and the sprint final are one race, matching the calendar. The id is the final’s FIS race id. Tour de Ski overall-standings rows are not races.

`watch` is a plain string and can be edited per race. It only states the 2026/27 US arrangements announced by [NBC Sports](https://www.nbcsports.com/pressbox/press-releases/nbc-sports-to-present-every-alpine-world-cup-and-world-championship-race-via-new-media-rights-agreements-with-u-s-ski-snowboard-and-fis), [U.S. Ski & Snowboard](https://www.usskiandsnowboard.org/news/new-era-world-cup-viewing-landmark-deal-between-nbc-us-ski-snowboard-and-fis-expands-coverage), and [FIS](https://www.fis-ski.com/inside-fis/news/2026-27/fis-world-cup-enters-new-era-of-broadcast-distribution-in-north-america) on 21 Oct 2026:

- Every alpine race: Peacock, live.
- Sölden: also an NBCSN delay on 25 Oct.
- Alpine races in the United States: Outside TV on demand as well.
- Other alpine races: YouTube replay after 24 hours.
- Cross-country (all of it is outside the US this season): live on the Ski & Snowboard World Cup YouTube channel and FAST channel.

`.github/workflows/podiums.yml` runs daily at 23:30 UTC. It writes a podium only when the FIS results page says official results, valid for FIS points, and the 1–2–3 cards match the results table. It does not replace a podium that is already filled, and it does not touch any other field.

Rebuild the file from the live FIS feeds with `python3 scripts/build_races.py`. Check the schedule logic with `node --test test/schedule.test.mjs`. Add `?asof=2026-11-20T15:00:00Z` to preview another moment.
