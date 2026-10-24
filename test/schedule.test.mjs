import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  countdownTarget,
  etDate,
  formatET,
  nextRace,
  pastRaces,
  phase,
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
