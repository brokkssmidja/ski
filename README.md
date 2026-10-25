# World Cup

Next FIS Alpine, Cross-Country, and Freeski World Cup race. Start times render in the viewer's time zone.

Static site. Open `index.html` or serve the folder. The manifest scope is `/ski/`, and the service worker caches the page for offline use. On an iPhone, Safari shows a dismissible banner: “Install: tap Share (square with arrow), then Add to Home Screen”. That banner stays hidden once the page is already running standalone, and Dismiss is remembered in `localStorage` (`ski-ios-install`). Android and desktop Chromium show an Install button when the browser fires `beforeinstallprompt`; dismissing that one lasts for the visit.

Alpine, Cross-country, Freeski, Men, and Women are separate chips. They combine, and the choice is kept in `localStorage` (`ski-filters`). A saved filter that never mentions freeski still shows it. Upcoming races sit under Today, This weekend, then the date or the week. Those headings, and the day on each race, follow the viewer's time zone, so a start can fall on a different calendar date than the FIS date. Slalom and giant slalom show run 1 and run 2 together, each with a short zone label such as EDT or CET. The zone is `Intl.DateTimeFormat().resolvedOptions().timeZone`. Stored start times stay UTC. Add to Google Calendar opens a prefilled event in a new tab, and Download .ics is the smaller option for Apple Calendar. Both use the UTC instant. A start time that is still TBA is an all-day event on the FIS date. A giant slalom or slalom runs until 1h15m after run 2, a downhill or super-G for 2 hours, and a timed cross-country race for 1h30m.

`contenders.js` is the list of Swedish, US, and Norwegian skiers to highlight. Edit the names there. Each block is one sport, gender, and discipline. Cross-country blocks use `sprint`, `distance`, or `relay` instead of every distance string.

Live opens FIS live timing in a new tab. It shows from one hour before the first start until the race is over, and it pulses while a run is in progress. Between runs the hero says `Run 1 done · Run 2 at …`. A two-run race is treated as over 1h15m after run 2, a downhill or super-G 2h after the start, and a timed cross-country race 1h30m after the start. A podium in `races.json` finishes the race immediately, replaces Live with Results (the FIS results page), and lists the podium with the winner first. The finished race stays in the hero for three hours after the estimated end, then moves under Today. A cross-country race with no start time shows Live for the whole venue-local day. Alpine links are `https://live.fis-ski.com/lv-alNNNN.htm` and cross-country links are `https://live.fis-ski.com/cc-NNNN/results-pda.htm`, where `NNNN` is the zero-padded `codex` on that race (the FIS competition codex). A race without a codex, such as Narvik before it is in the database, uses the FIS live index for that sport. `live.fis-ski.com` itself has no discipline home.

While Live is on screen, an alpine or cross-country race also shows a standings panel. The relay id is read from that Live URL: `lv-al0001.htm` is `al0001` (men's giant slalom, Sölden) and `lv-al5001.htm` is `al5001` (women's). Cross-country uses `cc` plus the same four digits. The page asks `https://relay.olaforsstromolsson.workers.dev/fis/live?codex=al0001&top=10&next=5` and shows the status message, the leader (flag, nation, name, time), the last finisher with rank and the gap, who is on course, the next three starters, and a top 10 that opens to the full list. Run 2 times are combined totals. The stamp `updated N s ago` uses the relay's `fetchedAt`. Polling is 5 seconds during a run and while the race is scheduled, 60 seconds between runs, and it stops when the relay reports the race finished or the tab is hidden. A relay error hides the panel and leaves the Live button in place. The card's status line follows that payload when one is in hand: a finished or official race says Finished instead of Underway. With no payload, the line stays on the clock. A scheduled race keeps its start countdown.

Freeski keeps the Live button and does not show that panel. The button opens `https://live.fis-ski.com/lv-fssNNNN.htm`. Those pages are a judged scoreboard (scores, judges, tricks), and the relay rejects an `fss` id, so there is no standings feed to poll. A freeski race with a published start is treated as four hours long, matching the Innsbruck big-air window. A freeski race with no start time shows Live for the whole venue-local day, the same as cross-country.

## Pages

The site is meant to be served at [https://brokkssmidja.github.io/ski/](https://brokkssmidja.github.io/ski/). Page assets are relative, so they resolve under `/ski/`. The manifest `scope` and `start_url` are `/ski/`.

Publishing has to be turned on in the repository settings. From this repo that is:

1. Open **Settings → Pages** ([github.com/brokkssmidja/ski/settings/pages](https://github.com/brokkssmidja/ski/settings/pages)).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

`.github/workflows/pages.yml` deploys the repository root on every push to `main`. The first run can sit at **Review deployments** until the `github-pages` environment is approved: **Actions → Deploy GitHub Pages → Review deployments → Approve and deploy**.

If **GitHub Actions** is not in the source list, use **Deploy from a branch**, branch **main**, folder **/ (root)**. The files already live at the root.

## Schedule

`races.json` is the 2026/27 World Cup for alpine (women and men, all disciplines), cross-country (women, men, and the mixed relay), and freeski (halfpipe, slopestyle, and big air, women and men). World Championships are not World Cup races and are not listed. Ski cross, moguls, and aerials are on the same freestyle feed and are not listed.

- Alpine dates: [World Cup calendar PDFs](https://www.fis-ski.com/alpine-skiing/documents) (women 17 Jul 2026, men file linked from that page).
- Cross-country dates: [Cross-Country World Cup Calendar 2026/27](https://www.fis-ski.com/cross-country/documents).
- Freeski dates: [Freeski World Cup calendar 2027](https://www.fis-ski.com/DB/freestyle-freeski/freeski/calendar-results.html?sectorcode=FS&seasoncode=2027&categorycode=WC&disciplinecode=HP,SS,BA&seasonmonth=X-2027), halfpipe, slopestyle, and big air only. Qualification is its own race: it has its own day, FIS race id, and live codex. That is 52 races, 26 women and 26 men. Innsbruck big air finals (women and men, 27 Nov 2026) are the only rows with a published clock: 18:45 Europe/Vienna, stored as `2026-11-27T17:45:00Z`. Every other freeski start is Time TBA. `watch` is empty, because the October 2026 NBC and FIS announcement covers alpine and cross-country.
- Start times: FIS database calendar, season 2027, category World Cup ([alpine](https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?sectorcode=AL&seasoncode=2027&categorycode=WC), [cross-country](https://www.fis-ski.com/DB/cross-country/calendar-results.html?sectorcode=CC&seasoncode=2027&categorycode=WC), [freeski](https://www.fis-ski.com/DB/freestyle-freeski/freeski/calendar-results.html?sectorcode=FS&seasoncode=2027&categorycode=WC&disciplinecode=HP,SS,BA&seasonmonth=X-2027)), via the public iCal feed. `Run 1 loc` / `Run 2 loc` are venue local time and are stored as UTC. European clocks fall back on 25 Oct 2026, so Sölden women (24 Oct, still CEST) and Sölden men (25 Oct, CET) are converted with that change. US venues use Mountain or Eastern time, including the November fallback and the March return to daylight time. Calgary uses Mountain time without daylight saving.

Narvik (women’s downhill and super-G, 12–13 Mar 2027) is on the women’s calendar as venue TBC and is not yet a timed row in the database, so those clocks are null. Cross-country rows in the database are dates without a start clock, so they are null too. The page shows **Time TBA** for a null time.

Sprint qualification and the sprint final are one race, matching the calendar. The id is the final’s FIS race id. Tour de Ski overall-standings rows are not races.

`watch` is a plain string and can be edited per race. It only states the 2026/27 US arrangements announced by [NBC Sports](https://www.nbcsports.com/pressbox/press-releases/nbc-sports-to-present-every-alpine-world-cup-and-world-championship-race-via-new-media-rights-agreements-with-u-s-ski-snowboard-and-fis), [U.S. Ski & Snowboard](https://www.usskiandsnowboard.org/news/new-era-world-cup-viewing-landmark-deal-between-nbc-us-ski-snowboard-and-fis-expands-coverage), and [FIS](https://www.fis-ski.com/inside-fis/news/2026-27/fis-world-cup-enters-new-era-of-broadcast-distribution-in-north-america) on 21 Oct 2026:

- Every alpine race: Peacock, live.
- Sölden: also an NBCSN delay on 25 Oct.
- Alpine races in the United States: Outside TV on demand as well.
- Other alpine races: YouTube replay after 24 hours.
- Cross-country (all of it is outside the US this season): live on the Ski & Snowboard World Cup YouTube channel and FAST channel.

`.github/workflows/podiums.yml` checks FIS every 15 minutes and, once a day at 23:30 UTC, sweeps any race that has already started. The frequent run only requests races inside the results window (from the start until a few hours after the estimated finish, or the race date when the start is TBA). It writes a podium only when the page says official results, valid for FIS points, and the 1–2–3 cards match the results table. It does not replace a podium that is already filled, and it does not touch any other field.

Rebuild the file from the live FIS feeds with `python3 scripts/build_races.py`. Check the schedule, the live panel, and the install hint with `node --test test/schedule.test.mjs test/live.test.mjs test/install.test.mjs`. Add `?asof=2026-11-20T15:00:00Z` to preview another moment.
