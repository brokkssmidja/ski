import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contendersByCountry, CONTENDERS } from "../contenders.js";
import {
  countdownTarget,
  formatClock,
  groupUpcoming,
  googleCalendarUrl,
  icsFor,
  isFinished,
  liveCodex,
  liveHref,
  liveTiming,
  localDate,
  matches,
  statusLine,
  nextRace,
  pastRaces,
  phase,
  raceCalendar,
  raceDay,
  startLines,
  tbaEnd,
  upcomingRaces,
  viewerTimeZone,
  watchSegments,
  zoneHeading,
  zonedTimeToUtc,
} from "../schedule.js";

const NY = "America/New_York";
const STO = "Europe/Stockholm";

const data = JSON.parse(readFileSync(new URL("../races.json", import.meta.url), "utf8"));
const races = data.races;
const all = { sport: "all", gender: "all" };

function at(iso) {
  return new Date(iso);
}

function find(venue, gender, discipline) {
  const race = races.find(
    (r) => r.venue === venue && r.gender === gender && (!discipline || r.discipline === discipline),
  );
  assert.ok(race, `${venue} ${gender} ${discipline || ""}`);
  return race;
}

test("Europe DST fallback: Sölden local clocks become the right UTC", () => {
  assert.equal(
    zonedTimeToUtc("2026-10-24", "13:30", "Europe/Vienna").toISOString(),
    "2026-10-24T11:30:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2026-10-25", "10:00", "Europe/Vienna").toISOString(),
    "2026-10-25T09:00:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2026-10-25", "00:00", "Europe/Vienna").toISOString(),
    "2026-10-24T22:00:00.000Z",
  );
});

test("North American zones used for November and the March finals", () => {
  assert.equal(
    zonedTimeToUtc("2026-11-28", "09:30", "America/New_York").toISOString(),
    "2026-11-28T14:30:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2026-11-28", "11:45", "America/Denver").toISOString(),
    "2026-11-28T18:45:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2027-03-20", "12:30", "America/Boise").toISOString(),
    "2027-03-20T18:30:00.000Z",
  );
});

test("stored FIS times stay UTC and render in the viewer zone", () => {
  const soldenW = find("Sölden", "women");
  assert.deepEqual(soldenW.starts, ["2026-10-24T08:30:00Z", "2026-10-24T11:30:00Z"]);
  assert.equal(formatClock(soldenW.starts[0], NY), "4:30 AM EDT");
  assert.equal(formatClock(soldenW.starts[1], NY), "7:30 AM EDT");
  assert.equal(formatClock(soldenW.starts[0], STO), "10:30 AM CEST");
  assert.equal(formatClock(soldenW.starts[1], STO), "1:30 PM CEST");

  const soldenM = find("Sölden", "men");
  assert.deepEqual(soldenM.starts, ["2026-10-25T09:00:00Z", "2026-10-25T12:00:00Z"]);
  assert.equal(formatClock(soldenM.starts[0], NY), "5:00 AM EDT");
  assert.equal(formatClock(soldenM.starts[1], NY), "8:00 AM EDT");
  assert.equal(formatClock(soldenM.starts[0], STO), "10:00 AM CET");
  assert.equal(formatClock(soldenM.starts[1], STO), "1:00 PM CET");

  assert.equal(formatClock(find("Killington", "women", "Giant Slalom").starts[0], NY), "9:30 AM EST");
  assert.equal(formatClock(find("Copper Mountain", "men", "Super-G").starts[0], NY), "1:45 PM EST");
  assert.equal(formatClock(find("Levi", "women").starts[0], NY), "4:00 AM EST");
  assert.equal(formatClock(find("Sun Valley", "women", "Downhill").starts[0], NY), "2:30 PM EDT");
  assert.equal(formatClock(find("Flachau", "women", "Giant Slalom").starts[0], NY), "11:45 AM EST");
  assert.equal(localDate(find("Åre", "men", "Slalom").starts[0], NY), "2027-03-14");
  assert.equal(localDate(find("Åre", "men", "Slalom").starts[0], "Pacific/Honolulu"), "2027-03-13");
  assert.equal(find("Killington", "women", "Giant Slalom").tz, "America/New_York");
  assert.equal("timezone" in data, false);
  assert.equal(viewerTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(zoneHeading("2026-10-24T16:00:00Z", NY), "EDT · America/New_York");
  assert.equal(zoneHeading("2026-10-24T16:00:00Z", STO), "CEST · Europe/Stockholm");
  assert.equal(zoneHeading("2026-10-25T16:00:00Z", STO), "CET · Europe/Stockholm");
  assert.equal(formatClock(soldenW.starts[0]), formatClock(soldenW.starts[0], viewerTimeZone()));
});

test("opening weekend: the women's race stays up after it finishes, then Sunday leads", () => {
  const now = at("2026-10-24T12:43:00Z");
  const hero = nextRace(races, now, all);
  assert.equal(hero.venue, "Sölden");
  assert.equal(hero.gender, "women");
  assert.equal(statusLine(hero, now), "Finished");
  assert.equal(pastRaces(races, now, all, NY).length, 0);

  const held = at("2026-10-24T15:44:00Z");
  assert.equal(nextRace(races, held, all).gender, "women");

  const later = at("2026-10-24T15:45:00Z");
  const next = nextRace(races, later, all);
  assert.equal(next.gender, "men");
  assert.equal(next.venue, "Sölden");
  const today = groupUpcoming(upcomingRaces(races, later, all, NY), later, NY).find((group) => group.title === "Today");
  assert.equal(today.races[0].gender, "women");
  assert.equal(today.races[0].venue, "Sölden");
  assert.equal(pastRaces(races, later, all, NY).some((race) => race.venue === "Sölden"), false);
});

test("simulated November: Gurgl is next, and a known start beats a same-day TBA", () => {
  const nov = at("2026-11-20T15:00:00Z");
  const hero = nextRace(races, nov, all);
  assert.equal(hero.venue, "Gurgl");
  assert.equal(hero.gender, "women");
  assert.equal(hero.discipline, "Slalom");
  assert.ok(pastRaces(races, nov, all, NY).some((r) => r.venue === "Sölden"));
  assert.ok(!upcomingRaces(races, nov, all, NY).some((r) => r.venue === "Sölden"));
  assert.equal(nextRace(races, nov, { sport: "xc", gender: "all" }).venue, "Ruka");

  const sat = at("2026-11-28T10:00:00Z");
  const saturday = nextRace(races, sat, all);
  assert.equal(saturday.venue, "Killington");
  assert.equal(saturday.discipline, "Giant Slalom");
});

test("simulated January: Laax slopestyle qualification, alpine still Cortina and Wengen", () => {
  const jan = at("2027-01-11T15:00:00Z");
  const hero = nextRace(races, jan, all);
  assert.equal(hero.venue, "Laax");
  assert.equal(hero.gender, "women");
  assert.equal(hero.discipline, "Slopestyle Qualification");
  const men = nextRace(races, jan, { sport: "all", gender: "men" });
  assert.equal(men.venue, "Laax");
  assert.equal(men.discipline, "Slopestyle Qualification");
  const alpineWomen = nextRace(races, jan, { sport: "alpine", gender: "women" });
  assert.equal(alpineWomen.venue, "Cortina d'Ampezzo");
  assert.equal(alpineWomen.discipline, "Downhill");
  const alpineMen = nextRace(races, jan, { sport: "alpine", gender: "men" });
  assert.equal(alpineMen.venue, "Wengen");
  assert.equal(alpineMen.discipline, "Super-G");
});

test("simulated February: Calgary halfpipe qualification, alpine still Garmisch", () => {
  const feb = at("2027-02-16T15:00:00Z");
  const hero = nextRace(races, feb, all);
  assert.equal(hero.venue, "Calgary");
  assert.equal(hero.gender, "women");
  assert.equal(hero.discipline, "Halfpipe Qualification");
  const alpineMen = nextRace(races, feb, { sport: "alpine", gender: "men" });
  assert.equal(alpineMen.venue, "Garmisch-Partenkirchen");
  assert.equal(alpineMen.discipline, "Downhill");
  const women = nextRace(races, feb, { sport: "alpine", gender: "women" });
  assert.equal(women.venue, "Lenzerheide");
  assert.equal(women.discipline, "Super-G");
  assert.ok(pastRaces(races, feb, { sport: "xc", gender: "all" }, NY).some((r) => r.venue === "Lahti"));
});

test("a TBA race stays up through the local day and then drops", () => {
  const ruka = find("Ruka", "women", "10 km Interval Start Classic");
  assert.deepEqual(ruka.starts, [null]);
  assert.equal(tbaEnd(ruka).toISOString(), "2026-11-27T22:00:00.000Z");
  assert.equal(phase(ruka, at("2026-11-27T21:00:00Z")), "upcoming");
  assert.equal(phase(ruka, at("2026-11-27T22:00:00Z")), "past");
});

test("calendar shape: alpine has times except Narvik, cross-country is TBA", () => {
  assert.equal(races.length, 196);
  const alpine = races.filter((r) => r.sport === "alpine");
  const xc = races.filter((r) => r.sport === "xc");
  const freeski = races.filter((r) => r.sport === "freeski");
  assert.equal(alpine.length, 83);
  assert.equal(xc.length, 61);
  assert.equal(freeski.length, 52);
  const tally = (gender, discipline) => freeski.filter((r) => r.gender === gender && r.discipline === discipline).length;
  for (const gender of ["women", "men"]) {
    assert.equal(tally(gender, "Halfpipe"), 5);
    assert.equal(tally(gender, "Halfpipe Qualification"), 5);
    assert.equal(tally(gender, "Slopestyle"), 4);
    assert.equal(tally(gender, "Slopestyle Qualification"), 4);
    assert.equal(tally(gender, "Big Air"), 4);
    assert.equal(tally(gender, "Big Air Qualification"), 4);
  }
  const tba = races.filter((r) => r.starts.some((s) => s == null));
  assert.equal(tba.length, 113);
  assert.equal(freeski.filter((r) => r.starts.some((s) => s == null)).length, 50);
  assert.deepEqual(
    tba.filter((r) => r.sport === "alpine").map((r) => r.id).sort(),
    ["alpine-narvik-20270312-dh", "alpine-narvik-20270313-sg"],
  );
  const soldenPodium = find("Sölden", "women").results.podium;
  assert.equal(soldenPodium[0].name, "MOLTZAN Paula");
  assert.equal(soldenPodium[0].country, "USA");
  assert.deepEqual(soldenPodium.map((row) => row.place), [1, 2, 3]);
  for (const race of races) {
    for (const key of ["id", "sport", "gender", "discipline", "venue", "country", "starts", "watch", "results"]) {
      assert.ok(key in race, race.id + " " + key);
    }
    if (race.id === "alpine-131577") continue;
    assert.deepEqual(race.results, { podium: [] });
  }
});

test("sport and gender chips combine", () => {
  const now = at("2026-10-24T06:00:00Z");
  const womenAlpine = nextRace(races, now, { alpine: true, xc: false, freeski: false, men: false, women: true });
  assert.equal(womenAlpine.sport, "alpine");
  assert.equal(womenAlpine.gender, "women");
  const menXc = nextRace(races, now, { alpine: false, xc: true, freeski: false, men: true, women: false });
  assert.equal(menXc.sport, "xc");
  assert.equal(menXc.gender, "men");
  const freeski = nextRace(races, at("2026-11-20T15:00:00Z"), { alpine: false, xc: false, freeski: true, men: true, women: true });
  assert.equal(freeski.venue, "Innsbruck");
  assert.equal(freeski.gender, "women");
  assert.equal(freeski.discipline, "Big Air Qualification");
  assert.equal(matches(freeski, { sport: "alpine", gender: "all" }), false);
  assert.equal(matches(find("Sölden", "women"), { alpine: true, xc: true, men: true, women: false }), false);
  assert.equal(matches(find("Sölden", "women"), { alpine: false, xc: true, men: true, women: true }), false);
  const relay = races.find((race) => race.gender === "mixed");
  assert.equal(matches(relay, { alpine: false, xc: true, men: true, women: false }), true);
  assert.equal(matches(relay, { alpine: false, xc: true, men: false, women: false }), false);
});

test("slalom and GS show run 1 and run 2 together", () => {
  assert.deepEqual(startLines(find("Sölden", "women"), NY), [
    "Run 1 · 4:30 AM EDT",
    "Run 2 · 7:30 AM EDT",
  ]);
  assert.deepEqual(startLines(find("Sölden", "women"), STO), [
    "Run 1 · 10:30 AM CEST",
    "Run 2 · 1:30 PM CEST",
  ]);
  assert.deepEqual(startLines(find("Levi", "men"), NY), [
    "Run 1 · 4:00 AM EST",
    "Run 2 · 7:00 AM EST",
  ]);
  assert.deepEqual(startLines(find("Sun Valley", "women", "Downhill"), NY), ["2:30 PM EDT"]);
  assert.deepEqual(startLines(find("Ruka", "women", "10 km Interval Start Classic"), STO), ["Time TBA"]);
});

test("upcoming groups: today, the days before the weekend, this weekend, then weeks", () => {
  const now = at("2026-11-25T16:00:00Z");
  assert.equal(localDate(now, NY), "2026-11-25");
  const sample = [
    { id: "a", date: "2026-11-25", starts: ["2026-11-25T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
    { id: "a2", date: "2026-11-25", starts: ["2026-11-25T18:00:00Z"], gender: "men", discipline: "Slalom", sport: "alpine" },
    { id: "b", date: "2026-11-26", starts: ["2026-11-26T15:00:00Z"], gender: "women", discipline: "Giant Slalom", sport: "alpine" },
    { id: "c", date: "2026-11-28", starts: ["2026-11-28T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
    { id: "d", date: "2026-11-29", starts: [null], tz: "Europe/Helsinki", gender: "men", discipline: "Slalom", sport: "alpine" },
    { id: "e", date: "2026-12-05", starts: ["2026-12-05T15:00:00Z"], gender: "women", discipline: "Downhill", sport: "alpine" },
  ];
  const groups = groupUpcoming(upcomingRaces(sample, now, all, NY), now, NY);
  assert.deepEqual(groups.map((group) => group.title), [
    "Today",
    "Thursday, Nov 26",
    "This weekend",
    "Nov 30 – Dec 6",
  ]);
  assert.deepEqual(groups[0].races.map((race) => race.id), ["a2"]);
  assert.deepEqual(groups[2].races.map((race) => race.id), ["c", "d"]);
});

test("opening saturday lists sunday under this weekend", () => {
  const now = at("2026-10-24T12:00:00Z");
  const groups = groupUpcoming(upcomingRaces(races, now, all, NY), now, NY);
  assert.equal(groups[0].title, "This weekend");
  assert.equal(groups[0].races[0].venue, "Sölden");
  assert.equal(groups[0].races[0].gender, "men");
  assert.equal(groups.some((group) => group.title === "Today"), false);
});

test("a friday with two races keeps the second one under today", () => {
  const now = at("2026-11-27T16:00:00Z");
  const groups = groupUpcoming(upcomingRaces(races, now, all, NY), now, NY);
  assert.equal(groups[0].title, "Today");
  assert.ok(groups[0].races.every((race) => race.date === "2026-11-27"));
  const weekend = groups.find((group) => group.title === "This weekend");
  assert.ok(weekend.races.some((race) => race.venue === "Killington"));
  assert.ok(weekend.races.every((race) => race.date === "2026-11-28" || race.date === "2026-11-29"));
});

test("sunday does not label the following saturday as this weekend", () => {
  const now = at("2026-11-29T16:00:00Z");
  assert.equal(localDate(now, NY), "2026-11-29");
  const sample = [
    { id: "sat", date: "2026-12-05", starts: ["2026-12-05T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
  ];
  const groups = groupUpcoming(sample, now, NY);
  assert.deepEqual(groups.map((group) => group.title), ["Nov 30 – Dec 6"]);
});

test("ics uses the real instants, and TBA is all-day", () => {
  const solden = find("Sölden", "women");
  const ics = icsFor(solden, at("2026-10-20T12:00:00Z"));
  for (const line of ics.split("\r\n").filter(Boolean)) {
    assert.ok(Buffer.byteLength(line) <= 75, line);
  }
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
  const text = ics.replace(/\r\n[ \t]/g, "");
  assert.match(text, /DTSTART:20261024T083000Z/);
  assert.match(text, /DTEND:20261024T124500Z/);
  assert.match(text, /Run 1/);
  assert.match(text, /Run 2/);
  const ny = icsFor(solden, at("2026-10-20T12:00:00Z"), NY).replace(/\r\n[ \t]/g, "");
  const sto = icsFor(solden, at("2026-10-20T12:00:00Z"), STO).replace(/\r\n[ \t]/g, "");
  assert.match(ny, /DTSTART:20261024T083000Z/);
  assert.match(sto, /DTSTART:20261024T083000Z/);
  assert.match(ny, /DTEND:20261024T124500Z/);
  assert.match(sto, /DTEND:20261024T124500Z/);
  assert.match(ny, /Run 1 · 4:30 AM EDT/);
  assert.match(sto, /Run 1 · 10:30 AM CEST/);
  assert.match(text, /Sölden/);
  assert.match(text, /Peacock/);
  assert.match(text, new RegExp(solden.id));

  const ruka = find("Ruka", "women", "10 km Interval Start Classic");
  const allDay = icsFor(ruka, at("2026-11-01T00:00:00Z")).replace(/\r\n[ \t]/g, "");
  assert.match(allDay, /DTSTART;VALUE=DATE:20261127/);
  assert.match(allDay, /DTEND;VALUE=DATE:20261128/);
  assert.doesNotMatch(allDay, /DTSTART:\d/);
  assert.match(allDay, /Time TBA/);
});

test("google calendar keeps UTC instants and puts the viewer zone in the details", () => {
  const solden = find("Sölden", "women");
  const women = new URL(googleCalendarUrl(solden, NY));
  const stockholm = new URL(googleCalendarUrl(solden, STO));
  assert.equal(women.origin + women.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(women.searchParams.get("action"), "TEMPLATE");
  assert.equal(women.searchParams.get("dates"), "20261024T083000Z/20261024T124500Z");
  assert.equal(stockholm.searchParams.get("dates"), women.searchParams.get("dates"));
  assert.equal(formatClock(solden.starts[0], NY), "4:30 AM EDT");
  assert.equal(formatClock("2026-10-24T12:45:00Z", NY), "8:45 AM EDT");
  assert.match(women.searchParams.get("text"), /Women's Giant Slalom — Sölden/);
  assert.match(women.searchParams.get("details"), /Run 1 · 4:30 AM EDT/);
  assert.match(women.searchParams.get("details"), /Run 2 · 7:30 AM EDT/);
  assert.match(stockholm.searchParams.get("details"), /Run 1 · 10:30 AM CEST/);
  assert.match(stockholm.searchParams.get("details"), /Run 2 · 1:30 PM CEST/);
  assert.match(women.searchParams.get("details"), /Peacock/);
  assert.match(women.searchParams.get("details"), /raceid=131577/);
  assert.equal(women.searchParams.get("location"), "Sölden, Austria");

  const men = find("Sölden", "men");
  const menUrl = new URL(googleCalendarUrl(men, NY));
  const menStockholm = new URL(googleCalendarUrl(men, STO));
  assert.equal(formatClock(men.starts[0], NY), "5:00 AM EDT");
  assert.equal(formatClock(men.starts[1], NY), "8:00 AM EDT");
  assert.equal(menUrl.searchParams.get("dates"), "20261025T090000Z/20261025T131500Z");
  assert.equal(menStockholm.searchParams.get("dates"), menUrl.searchParams.get("dates"));
  assert.equal(formatClock("2026-10-25T13:15:00Z", NY), "9:15 AM EDT");

  const killington = find("Killington", "women", "Giant Slalom");
  assert.equal(formatClock(killington.starts[0], NY), "9:30 AM EST");
  assert.equal(formatClock(killington.starts[1], NY), "12:30 PM EST");
  const killingtonUrl = new URL(googleCalendarUrl(killington, NY));
  assert.equal(killingtonUrl.searchParams.get("dates"), "20261128T143000Z/20261128T184500Z");
  assert.equal(new URL(googleCalendarUrl(killington, STO)).searchParams.get("dates"), "20261128T143000Z/20261128T184500Z");
  assert.equal(formatClock("2026-11-28T18:45:00Z", NY), "1:45 PM EST");
  assert.match(killingtonUrl.searchParams.get("details"), /Outside TV/);
  assert.equal(killingtonUrl.searchParams.get("location"), "Killington, United States");

  const downhill = find("Sun Valley", "women", "Downhill");
  assert.equal(downhill.starts[0], "2027-03-20T18:30:00Z");
  assert.equal(formatClock(downhill.starts[0], NY), "2:30 PM EDT");
  const downhillUrl = new URL(googleCalendarUrl(downhill, NY));
  assert.equal(downhillUrl.searchParams.get("dates"), "20270320T183000Z/20270320T203000Z");
  assert.equal(new URL(googleCalendarUrl(downhill, STO)).searchParams.get("dates"), "20270320T183000Z/20270320T203000Z");
  assert.equal(formatClock("2027-03-20T20:30:00Z", NY), "4:30 PM EDT");

  const ruka = find("Ruka", "women", "10 km Interval Start Classic");
  const tba = new URL(googleCalendarUrl(ruka, STO));
  assert.equal(tba.searchParams.get("dates"), "20261127/20261128");
  assert.equal(raceDay(ruka, STO), ruka.date);
  assert.equal(raceDay(ruka, "Pacific/Auckland"), ruka.date);
  assert.match(tba.searchParams.get("details"), /Time TBA/);
  assert.match(tba.searchParams.get("details"), /YouTube/);
  assert.match(tba.searchParams.get("details"), /raceid=52084/);
  assert.equal(tba.searchParams.get("location"), "Ruka, Finland");
});

test("date headings follow the viewer zone when a start crosses midnight", () => {
  const solden = find("Sölden", "women");
  assert.equal(raceCalendar(solden, NY).label, "Saturday, October 24");
  assert.equal(raceCalendar(solden, STO).label, "Saturday, October 24");
  assert.equal(raceCalendar(solden, "Pacific/Honolulu").label, "Friday, October 23");
  assert.equal(raceCalendar(solden, "Pacific/Honolulu").day, "23");
  assert.equal(raceCalendar(solden, "Pacific/Honolulu").dow, "Fri");

  const copper = find("Copper Mountain", "men", "Super-G");
  const now = at("2026-11-28T12:00:00Z");
  assert.equal(raceCalendar(copper, NY).label, "Saturday, November 28");
  assert.equal(raceCalendar(copper, STO).label, "Saturday, November 28");
  assert.equal(raceCalendar(copper, "Asia/Tokyo").label, "Sunday, November 29");
  assert.equal(groupUpcoming([copper], now, NY)[0].title, "Today");
  assert.equal(groupUpcoming([copper], now, STO)[0].title, "Today");
  assert.equal(groupUpcoming([copper], now, "Asia/Tokyo")[0].title, "This weekend");
});

function watched(race) {
  return contendersByCountry(race).flatMap((row) => row.names);
}

test("SE, US, and NO contenders follow discipline", () => {
  for (const group of CONTENDERS) {
    assert.ok(["alpine", "xc"].includes(group.sport));
    assert.ok(["women", "men", "mixed"].includes(group.gender));
    for (const athlete of group.athletes) {
      assert.ok(["SWE", "USA", "NOR"].includes(athlete.country), athlete.name);
    }
  }

  const gs = find("Sölden", "women", "Giant Slalom");
  assert.ok(watched(gs).includes("Mikaela Shiffrin"));
  assert.ok(watched(gs).includes("Sara Hector"));
  assert.deepEqual(contendersByCountry(gs).map((row) => row.code), ["SE", "US", "NO"]);

  const slalom = find("Levi", "women", "Slalom");
  assert.ok(watched(slalom).includes("Mikaela Shiffrin"));
  assert.equal(watched(slalom).includes("Sara Hector"), false);

  const menSl = find("Levi", "men", "Slalom");
  assert.ok(watched(menSl).includes("Henrik Kristoffersen"));
  assert.ok(watched(menSl).includes("Atle Lie McGrath"));

  const sprint = find("Ruka", "men", "1.2 km Sprint Classic");
  assert.ok(watched(sprint).includes("Johannes Høsflot Klæbo"));

  const distance = find("Ruka", "women", "10 km Interval Start Classic");
  assert.ok(watched(distance).includes("Jessie Diggins"));

  const womenSprint = find("Ruka", "women", "1.2 km Sprint Classic");
  const swedes = contendersByCountry(womenSprint).find((row) => row.code === "SE");
  assert.ok(swedes.names.includes("Jonna Sundling"));
  assert.ok(swedes.names.includes("Maja Dahlqvist"));
  assert.ok(swedes.names.includes("Linn Svahn"));
});

test("live codex is the id in the live.fis-ski.com URL", () => {
  assert.equal(liveCodex(find("Sölden", "men")), "al0001");
  assert.equal(liveCodex(find("Sölden", "women")), "al5001");
  assert.equal(liveHref(find("Sölden", "men")), "https://live.fis-ski.com/lv-al0001.htm");
  assert.equal(liveHref(find("Sölden", "women")), "https://live.fis-ski.com/lv-al5001.htm");
  assert.equal(
    liveCodex(find("Ruka", "women", "10 km Interval Start Classic")),
    "cc0578",
  );
  const narvik = races.find((race) => race.id === "alpine-narvik-20270312-dh");
  assert.equal(liveCodex(narvik), null);

  for (const race of races) {
    const codex = liveCodex(race);
    if (Number.isInteger(race.codex) && race.sport === "alpine") {
      assert.equal(codex, `al${String(race.codex).padStart(4, "0")}`, race.id);
    } else if (Number.isInteger(race.codex) && race.sport === "xc") {
      assert.equal(codex, `cc${String(race.codex).padStart(4, "0")}`, race.id);
    } else {
      assert.equal(codex, null, race.id);
    }
  }
});

test("live timing uses the FIS codex and the race window", () => {
  const solden = find("Sölden", "women");
  assert.equal(solden.codex, 5001);
  assert.equal(liveHref(solden), "https://live.fis-ski.com/lv-al5001.htm");
  assert.equal(liveHref(find("Sölden", "men")), "https://live.fis-ski.com/lv-al0001.htm");

  const ruka = find("Ruka", "women", "10 km Interval Start Classic");
  assert.equal(ruka.codex, 578);
  assert.equal(liveHref(ruka), "https://live.fis-ski.com/cc-0578/results-pda.htm");

  const narvik = races.find((race) => race.id === "alpine-narvik-20270312-dh");
  assert.equal(narvik.codex, undefined);
  assert.equal(liveHref(narvik), "https://www.fis-ski.com/DB/alpine-skiing/live.html");

  assert.equal(liveTiming(solden, at("2026-10-24T07:29:59Z")), null);
  assert.deepEqual(liveTiming(solden, at("2026-10-24T07:30:00Z")), {
    href: "https://live.fis-ski.com/lv-al5001.htm",
    pulsing: false,
  });
  assert.equal(liveTiming(solden, at("2026-10-24T08:30:00Z")), null);
  assert.equal(isFinished(solden, at("2026-10-24T12:43:00Z")), true);

  const open = { ...solden, results: { podium: [] } };
  assert.equal(statusLine(open, at("2026-10-24T09:00:00Z")), "Underway");
  assert.equal(statusLine(open, at("2026-10-24T10:00:00Z"), NY), "Run 1 done · Run 2 at 7:30 AM EDT");
  assert.equal(statusLine(open, at("2026-10-24T10:00:00Z"), STO), "Run 1 done · Run 2 at 1:30 PM CEST");
  assert.equal(liveTiming(open, at("2026-10-24T10:00:00Z")).pulsing, false);
  assert.equal(statusLine(open, at("2026-10-24T12:00:00Z")), "Underway");
  assert.equal(liveTiming(open, at("2026-10-24T12:00:00Z")).pulsing, true);
  assert.equal(statusLine(open, at("2026-10-24T12:44:59Z")), "Underway");
  assert.equal(statusLine(open, at("2026-10-24T12:45:00Z")), "Finished");
  assert.equal(liveTiming(open, at("2026-10-24T12:45:00Z")), null);

  const downhill = find("Sun Valley", "women", "Downhill");
  const gun = new Date(downhill.starts[0]).getTime();
  assert.equal(statusLine(downhill, new Date(gun + 60 * 60 * 1000)), "Underway");
  assert.equal(statusLine(downhill, new Date(gun + 2 * 60 * 60 * 1000)), "Finished");
  const xc = {
    ...find("Ruka", "women", "10 km Interval Start Classic"),
    starts: ["2026-11-27T09:00:00Z"],
    results: { podium: [] },
  };
  assert.equal(statusLine(xc, at("2026-11-27T10:29:00Z")), "Underway");
  assert.equal(statusLine(xc, at("2026-11-27T10:30:00Z")), "Finished");

  assert.equal(liveTiming(ruka, at("2026-11-26T21:59:59Z")), null);
  assert.equal(liveTiming(ruka, at("2026-11-26T22:00:00Z")).pulsing, true);
  assert.equal(liveTiming(ruka, at("2026-11-27T12:00:00Z")).href, liveHref(ruka));
  assert.equal(liveTiming(ruka, at("2026-11-27T22:00:00Z")), null);
  assert.equal(liveTiming(narvik, at("2027-03-12T12:00:00Z")), null);

  const final = find("Innsbruck", "women", "Big Air");
  assert.equal(final.codex, 8003);
  assert.equal(final.starts[0], "2026-11-27T17:45:00Z");
  assert.equal(formatClock(final.starts[0], NY), "12:45 PM EST");
  assert.equal(liveHref(final), "https://live.fis-ski.com/lv-fss8003.htm");
  assert.equal(liveCodex(final), null);
  assert.equal(liveTiming(final, at("2026-11-27T16:44:00Z")), null);
  assert.deepEqual(liveTiming(final, at("2026-11-27T16:45:00Z")), {
    href: "https://live.fis-ski.com/lv-fss8003.htm",
    pulsing: false,
  });
  assert.equal(liveTiming(final, at("2026-11-27T17:45:00Z")).pulsing, true);
  assert.equal(statusLine(final, at("2026-11-27T17:45:00Z")), "Underway");
  assert.equal(statusLine(final, at("2026-11-27T21:45:00Z")), "Finished");
  assert.equal(liveTiming(final, at("2026-11-27T21:45:00Z")), null);
  const qual = find("Innsbruck", "women", "Big Air Qualification");
  assert.equal(qual.codex, 8001);
  assert.deepEqual(qual.starts, [null]);
  assert.equal(liveCodex(qual), null);
  assert.equal(liveTiming(qual, at("2026-11-25T22:59:59Z")), null);
  assert.equal(liveTiming(qual, at("2026-11-25T23:00:00Z")).href, "https://live.fis-ski.com/lv-fss8001.htm");
  assert.equal(liveTiming(qual, at("2026-11-25T23:00:00Z")).pulsing, true);
  assert.equal(liveTiming(qual, at("2026-11-26T23:00:00Z")), null);

  const seen = new Set();
  for (const race of races) {
    if (/^(alpine|xc|freeski)-\d+$/.test(race.id)) {
      assert.equal(Number.isInteger(race.codex), true, race.id);
      assert.ok(race.codex >= 0 && race.codex <= 9999, race.id);
      const key = `${race.sport}:${race.codex}`;
      assert.equal(seen.has(key), false, key);
      seen.add(key);
      if (race.sport === "freeski") {
        assert.equal(liveCodex(race), null, race.id);
        assert.equal(
          liveHref(race),
          `https://live.fis-ski.com/lv-fss${String(race.codex).padStart(4, "0")}.htm`,
          race.id,
        );
      }
    } else {
      assert.equal(race.codex, undefined, race.id);
    }
  }
});

test("watch lines name streaming sites as compact external links", () => {
  const labels = (text) => watchSegments(text).filter((part) => part.type === "link").map((part) => part.label);
  const solden = watchSegments("US: Peacock (live). NBCSN delay Oct 25.");
  assert.deepEqual(labels("US: Peacock (live). NBCSN delay Oct 25."), ["NBC Peacock"]);
  assert.equal(solden[0].text, "US: ");
  assert.equal(solden[1].site, "NBC Peacock");
  assert.equal(solden[1].href, "https://www.peacocktv.com/sports");
  assert.equal(solden[2].text, " (live). NBCSN delay Oct 25.");

  const replay = "US: Peacock (live). YouTube after 24h.";
  assert.deepEqual(labels(replay), ["NBC Peacock", "YouTube"]);
  assert.equal(watchSegments(replay).at(-1).text, " after 24h.");

  const channel = watchSegments("US: YouTube & Ski & Snowboard World Cup (live).");
  assert.deepEqual(labels("US: YouTube & Ski & Snowboard World Cup (live)."), ["YouTube"]);
  assert.equal(channel[1].href, "https://www.youtube.com/@skiandsnowboardworldcup");
  assert.equal(channel[2].text, " (live).");

  const home = watchSegments("US: Peacock (live). Outside TV on demand.");
  assert.deepEqual(labels("US: Peacock (live). Outside TV on demand."), ["NBC Peacock", "Outside TV"]);
  assert.equal(home[3].href, "https://watch.outsideonline.com/");

  for (const race of races) {
    const links = watchSegments(race.watch).filter((part) => part.type === "link");
    if (!race.watch) {
      assert.equal(race.sport, "freeski", race.id);
      continue;
    }
    assert.ok(links.length >= 1, race.id);
    for (const link of links) assert.match(link.href, /^https:\/\//);
  }
});

test("pages paths stay under /ski/", () => {
  const root = new URL("../", import.meta.url);
  const html = readFileSync(new URL("index.html", root), "utf8");
  const css = readFileSync(new URL("styles.css", root), "utf8");
  const schedule = readFileSync(new URL("schedule.js", root), "utf8");
  const app = readFileSync(new URL("app.js", root), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  assert.match(schedule, /resolvedOptions\(\)\.timeZone/);
  assert.doesNotMatch(schedule, /America\/New_York/);
  assert.doesNotMatch(html, /Eastern Time/);
  assert.doesNotMatch(html, /America\/New_York/);
  assert.doesNotMatch(manifest.description, /Eastern Time/);
  assert.doesNotMatch(app, /America\/New_York/);
  assert.match(html, /class="tz-name"/);
  const worker = readFileSync(new URL("sw.js", root), "utf8");
  const pages = readFileSync(new URL(".github/workflows/pages.yml", root), "utf8");
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.match(html, /href="manifest\.json"/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.equal(manifest.scope, "/ski/");
  assert.equal(manifest.start_url, "/ski/");
  assert.equal(manifest.id, "/ski/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  for (const icon of manifest.icons) assert.equal(icon.src.includes("/"), false);
  assert.match(worker, /addEventListener\("fetch"/);
  assert.match(worker, /contenders\.js/);
  assert.match(worker, /install\.js/);
  assert.match(html, /id="install-hint"/);
  assert.match(html, /data-filter="freeski"/);
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.match(pages, /path: \./);
  const podiums = readFileSync(new URL(".github/workflows/podiums.yml", root), "utf8");
  assert.match(podiums, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(podiums, /cron: "30 23 \* \* \*"/);
});
