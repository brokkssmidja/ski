import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contendersByCountry, CONTENDERS } from "../contenders.js";
import {
  countdownTarget,
  etDate,
  formatET,
  groupUpcoming,
  icsFor,
  matches,
  nextRace,
  pastRaces,
  phase,
  startLines,
  tbaEnd,
  upcomingRaces,
  zonedTimeToUtc,
} from "../schedule.js";

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

test("stored FIS times spot-check in Eastern Time", () => {
  const soldenW = find("Sölden", "women");
  assert.deepEqual(soldenW.starts, ["2026-10-24T08:30:00Z", "2026-10-24T11:30:00Z"]);
  assert.equal(formatET(soldenW.starts[0]), "4:30 AM ET");
  assert.equal(formatET(soldenW.starts[1]), "7:30 AM ET");

  const soldenM = find("Sölden", "men");
  assert.deepEqual(soldenM.starts, ["2026-10-25T09:00:00Z", "2026-10-25T12:00:00Z"]);
  assert.equal(formatET(soldenM.starts[0]), "5:00 AM ET");
  assert.equal(formatET(soldenM.starts[1]), "8:00 AM ET");

  assert.equal(formatET(find("Killington", "women", "Giant Slalom").starts[0]), "9:30 AM ET");
  assert.equal(formatET(find("Copper Mountain", "men", "Super-G").starts[0]), "1:45 PM ET");
  assert.equal(formatET(find("Levi", "women").starts[0]), "4:00 AM ET");
  assert.equal(formatET(find("Sun Valley", "women", "Downhill").starts[0]), "2:30 PM ET");
  assert.equal(formatET(find("Flachau", "women", "Giant Slalom").starts[0]), "11:45 AM ET");
  assert.equal(etDate(find("Åre", "men", "Slalom").starts[0]), "2027-03-14");
});

test("opening weekend: live between runs, then the men's race", () => {
  const now = at("2026-10-24T10:00:00Z");
  const hero = nextRace(races, now, all);
  assert.equal(hero.venue, "Sölden");
  assert.equal(hero.gender, "women");
  assert.equal(phase(hero, now), "live");
  assert.equal(countdownTarget(hero, now).toISOString(), "2026-10-24T11:30:00.000Z");
  assert.equal(pastRaces(races, now, all).length, 0);

  const later = at("2026-10-24T15:00:00Z");
  const next = nextRace(races, later, all);
  assert.equal(next.gender, "men");
  assert.equal(next.venue, "Sölden");
  assert.equal(phase(find("Sölden", "women"), later), "past");
});

test("simulated November: Gurgl is next, and a known start beats a same-day TBA", () => {
  const nov = at("2026-11-20T15:00:00Z");
  const hero = nextRace(races, nov, all);
  assert.equal(hero.venue, "Gurgl");
  assert.equal(hero.gender, "women");
  assert.equal(hero.discipline, "Slalom");
  assert.ok(pastRaces(races, nov, all).some((r) => r.venue === "Sölden"));
  assert.ok(!upcomingRaces(races, nov, all).some((r) => r.venue === "Sölden"));
  assert.equal(nextRace(races, nov, { sport: "xc", gender: "all" }).venue, "Ruka");

  const sat = at("2026-11-28T10:00:00Z");
  const saturday = nextRace(races, sat, all);
  assert.equal(saturday.venue, "Killington");
  assert.equal(saturday.discipline, "Giant Slalom");
});

test("simulated January: Cortina downhill, unless filtered to men", () => {
  const jan = at("2027-01-11T15:00:00Z");
  const hero = nextRace(races, jan, all);
  assert.equal(hero.venue, "Cortina d'Ampezzo");
  assert.equal(hero.gender, "women");
  assert.equal(hero.discipline, "Downhill");
  const men = nextRace(races, jan, { sport: "all", gender: "men" });
  assert.equal(men.venue, "Wengen");
  assert.equal(men.discipline, "Super-G");
});

test("simulated February: after Lahti, Garmisch downhill is next", () => {
  const feb = at("2027-02-16T15:00:00Z");
  const hero = nextRace(races, feb, all);
  assert.equal(hero.venue, "Garmisch-Partenkirchen");
  assert.equal(hero.gender, "men");
  assert.equal(hero.discipline, "Downhill");
  const women = nextRace(races, feb, { sport: "alpine", gender: "women" });
  assert.equal(women.venue, "Lenzerheide");
  assert.equal(women.discipline, "Super-G");
  assert.ok(pastRaces(races, feb, { sport: "xc", gender: "all" }).some((r) => r.venue === "Lahti"));
});

test("a TBA race stays up through the local day and then drops", () => {
  const ruka = find("Ruka", "women", "10 km Interval Start Classic");
  assert.deepEqual(ruka.starts, [null]);
  assert.equal(tbaEnd(ruka).toISOString(), "2026-11-27T22:00:00.000Z");
  assert.equal(phase(ruka, at("2026-11-27T21:00:00Z")), "upcoming");
  assert.equal(phase(ruka, at("2026-11-27T22:00:00Z")), "past");
});

test("calendar shape: alpine has times except Narvik, cross-country is TBA", () => {
  assert.equal(races.length, 144);
  const alpine = races.filter((r) => r.sport === "alpine");
  const xc = races.filter((r) => r.sport === "xc");
  assert.equal(alpine.length, 83);
  assert.equal(xc.length, 61);
  const tba = races.filter((r) => r.starts.some((s) => s == null));
  assert.equal(tba.length, 63);
  assert.deepEqual(
    tba.filter((r) => r.sport === "alpine").map((r) => r.id).sort(),
    ["alpine-narvik-20270312-dh", "alpine-narvik-20270313-sg"],
  );
  for (const race of races) {
    for (const key of ["id", "sport", "gender", "discipline", "venue", "country", "starts", "watch", "results"]) {
      assert.ok(key in race, race.id + " " + key);
    }
    assert.deepEqual(race.results, { podium: [] });
  }
});

test("sport and gender chips combine", () => {
  const now = at("2026-10-24T06:00:00Z");
  const womenAlpine = nextRace(races, now, { alpine: true, xc: false, men: false, women: true });
  assert.equal(womenAlpine.sport, "alpine");
  assert.equal(womenAlpine.gender, "women");
  const menXc = nextRace(races, now, { alpine: false, xc: true, men: true, women: false });
  assert.equal(menXc.sport, "xc");
  assert.equal(menXc.gender, "men");
  assert.equal(matches(find("Sölden", "women"), { alpine: true, xc: true, men: true, women: false }), false);
  assert.equal(matches(find("Sölden", "women"), { alpine: false, xc: true, men: true, women: true }), false);
  const relay = races.find((race) => race.gender === "mixed");
  assert.equal(matches(relay, { alpine: false, xc: true, men: true, women: false }), true);
  assert.equal(matches(relay, { alpine: false, xc: true, men: false, women: false }), false);
});

test("slalom and GS show run 1 and run 2 together", () => {
  assert.deepEqual(startLines(find("Sölden", "women")), [
    "Run 1 · 4:30 AM ET",
    "Run 2 · 7:30 AM ET",
  ]);
  assert.deepEqual(startLines(find("Levi", "men")), [
    "Run 1 · 4:00 AM ET",
    "Run 2 · 7:00 AM ET",
  ]);
  assert.deepEqual(startLines(find("Sun Valley", "women", "Downhill")), ["2:30 PM ET"]);
  assert.deepEqual(startLines(find("Ruka", "women", "10 km Interval Start Classic")), ["Time TBA"]);
});

test("upcoming groups: today, the days before the weekend, this weekend, then weeks", () => {
  const now = at("2026-11-25T16:00:00Z");
  assert.equal(etDate(now.toISOString()), "2026-11-25");
  const sample = [
    { id: "a", date: "2026-11-25", starts: ["2026-11-25T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
    { id: "a2", date: "2026-11-25", starts: ["2026-11-25T18:00:00Z"], gender: "men", discipline: "Slalom", sport: "alpine" },
    { id: "b", date: "2026-11-26", starts: ["2026-11-26T15:00:00Z"], gender: "women", discipline: "Giant Slalom", sport: "alpine" },
    { id: "c", date: "2026-11-28", starts: ["2026-11-28T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
    { id: "d", date: "2026-11-29", starts: [null], tz: "Europe/Helsinki", gender: "men", discipline: "Slalom", sport: "alpine" },
    { id: "e", date: "2026-12-05", starts: ["2026-12-05T15:00:00Z"], gender: "women", discipline: "Downhill", sport: "alpine" },
  ];
  const groups = groupUpcoming(upcomingRaces(sample, now, all), now);
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
  const groups = groupUpcoming(upcomingRaces(races, now, all), now);
  assert.equal(groups[0].title, "This weekend");
  assert.equal(groups[0].races[0].venue, "Sölden");
  assert.equal(groups[0].races[0].gender, "men");
  assert.equal(groups.some((group) => group.title === "Today"), false);
});

test("a friday with two races keeps the second one under today", () => {
  const now = at("2026-11-27T16:00:00Z");
  const groups = groupUpcoming(upcomingRaces(races, now, all), now);
  assert.equal(groups[0].title, "Today");
  assert.ok(groups[0].races.every((race) => race.date === "2026-11-27"));
  const weekend = groups.find((group) => group.title === "This weekend");
  assert.ok(weekend.races.some((race) => race.venue === "Killington"));
  assert.ok(weekend.races.every((race) => race.date === "2026-11-28" || race.date === "2026-11-29"));
});

test("sunday does not label the following saturday as this weekend", () => {
  const now = at("2026-11-29T16:00:00Z");
  assert.equal(etDate(now.toISOString()), "2026-11-29");
  const sample = [
    { id: "sat", date: "2026-12-05", starts: ["2026-12-05T15:00:00Z"], gender: "women", discipline: "Slalom", sport: "alpine" },
  ];
  const groups = groupUpcoming(sample, now);
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
  assert.match(text, /DTEND:20261024T140000Z/);
  assert.match(text, /Run 1/);
  assert.match(text, /Run 2/);
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

test("pages paths stay under /ski/", () => {
  const root = new URL("../", import.meta.url);
  const html = readFileSync(new URL("index.html", root), "utf8");
  const css = readFileSync(new URL("styles.css", root), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
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
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.match(pages, /path: \./);
});
