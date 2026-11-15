import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ageLabel,
  badgeText,
  displayState,
  finisherModel,
  findRace,
  leaderModel,
  ordinal,
  parseTimingXml,
  raceModel,
  raceSlug,
  stillToCome,
  statusModel,
  timingXmlUrl,
} from "../racemodel.js";

const races = [
  { id: "alpine-131580", venue: "Levi", discipline: "Slalom", gender: "men", date: "2026-11-15" },
  { id: "alpine-131579", venue: "Levi", discipline: "Slalom", gender: "women", date: "2026-11-14" },
  { id: "xc-a", venue: "Ruka", discipline: "10 km Interval Start Classic", gender: "women", date: "2026-11-28" },
  { id: "xc-b", venue: "Ruka", discipline: "10 km Interval Start Classic", gender: "women", date: "2026-11-29" },
];

test("the Levi men's slalom hash is levi-sl-men", () => {
  assert.equal(raceSlug(races[0], races), "levi-sl-men");
  assert.equal(raceSlug(races[1], races), "levi-sl-women");
  assert.equal(findRace("levi-sl-men", races).id, "alpine-131580");
  assert.equal(findRace("alpine-131580", races).venue, "Levi");
  assert.match(raceSlug(races[2], races), /^ruka-10k-women-/);
  assert.equal(timingXmlUrl("al0002"), "https://live.fis-ski.com/al0002/main.xml");
  assert.equal(timingXmlUrl("cc0578"), "");
});

test("a reload shows the cached race instead of a blank hold", () => {
  const cached = { at: 1_000, payload: { status: "live", message: "cached" }, field: null };
  const fresh = [{ at: 60_000, payload: { status: "live", message: "too new" }, field: null }];
  const shown = displayState({ snapshots: fresh, delayMs: 50_000, now: 60_000, cached });
  assert.equal(shown.payload.message, "cached");
  assert.equal(shown.fromCache, true);
  const ready = displayState({
    snapshots: [{ at: 5_000, payload: { message: "old enough" } }, fresh[0]],
    delayMs: 50_000,
    now: 60_000,
    cached,
  });
  assert.equal(ready.payload.message, "old enough");
  assert.equal(ageLabel(50_000, 62_000), "last update 12 s ago");
});

test("status, leader and last finisher use the counts from the relay", () => {
  const payload = {
    status: "live",
    run: 2,
    runs: 2,
    counts: { starters: 30, finished: 13, dnf: 5, remaining: 11 },
    onCourse: [{ bib: 12, name: "Linus STRASSER", nation: "GER" }],
    currentLeader: { rank: 1, name: "Alex VINATZER", nation: "ITA", time: "1:48.91" },
    lastFinisher: { rank: 4, name: "Tanguy NEF", nation: "SUI", time: "1:49.90", diff: "+0.99" },
  };
  assert.equal(statusModel(payload).text, "Run 2 of 2 · 13 of 30 down · 11 to go");
  assert.equal(statusModel(payload).dnf, "5 DNF");
  assert.ok(statusModel(payload).progress > 0.5);
  assert.equal(leaderModel(payload).note, "leading · 12 skiers to beat");
  assert.equal(finisherModel(payload).delta, "+0.99 → 4th");
  assert.equal(finisherModel(payload).tone, "bad");
  assert.equal(finisherModel({ lastFinisher: { rank: 1, name: "A B", diff: "-0.10" } }).delta, "NEW LEADER");
  assert.equal(badgeText(payload), "Live · Alex Vinatzer 1:48.91");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(11), "11th");
});

test("the real Levi file has the whole run 2 start list and run 1 ranks", () => {
  const xml = readFileSync(new URL("./fixtures/al0002-main.xml", import.meta.url), "utf8");
  const field = parseTimingXml(xml);
  assert.ok(field);
  assert.equal(field.runs[0].length, 86);
  assert.equal(field.runs[1].length, 30);
  const strasser = field.runs[1].find((row) => row.bib === 12);
  assert.equal(strasser.name, "Linus Strasser");
  assert.equal(strasser.nation, "GER");
  assert.ok(strasser.run1.rank >= 1);
  assert.match(strasser.run1.time, /^\d/);
  const rewound = {
    runs: field.runs.map((run, index) => (index === 1
      ? run.map((athlete) => (athlete.order > strasser.order ? { ...athlete, status: "" } : athlete))
      : run)),
  };
  const payload = {
    status: "live",
    run: 2,
    runs: 2,
    onCourse: [{ bib: 12, name: "Linus STRASSER", nation: "GER" }],
    counts: { starters: 30, finished: 13, dnf: 5, remaining: 11 },
  };
  const model = raceModel({ payload, field: rewound, at: 0, now: 1000 });
  assert.equal(model.onCourse[0].note.startsWith("was "), true);
  assert.equal(model.onCourse[0].name, "Linus Strasser");
  assert.ok(model.coming.length >= 1);
  assert.match(model.coming[0].label, /^1 of /);
  assert.equal(model.coming.some((row) => row.nation === "NOR" && row.highlight), true);
  const queued = stillToCome(rewound, { run: 2, onCourse: [{ bib: 12 }] });
  assert.equal(queued.some((row) => row.bib === 12), false);
});
