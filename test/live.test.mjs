import assert from "node:assert/strict";
import test from "node:test";
import {
  athleteDiff,
  countsLine,
  formatDiff,
  livePayloadOk,
  nationFlag,
  nextStarters,
  onCourse,
  parseRaceTime,
  pollDelay,
  cardStatus,
  relayUrl,
  runLabel,
  timesNote,
  topResults,
  updatedAgo,
} from "../live.js";

const leader = {
  rank: 1,
  bib: 4,
  name: "Lucas PINHEIRO BRAATHEN",
  nation: "BRA",
  time: "52.40",
  timeMs: 52400,
  diff: "0.00",
};

test("relay url asks for the live codex, a top 10, and five upcoming starters", () => {
  const url = new URL(relayUrl("al0001"));
  assert.equal(url.origin, "https://relay.olaforsstromolsson.workers.dev");
  assert.equal(url.pathname, "/fis/live");
  assert.equal(url.searchParams.get("codex"), "al0001");
  assert.equal(url.searchParams.get("top"), "10");
  assert.equal(url.searchParams.get("next"), "5");
  assert.equal(new URL(relayUrl("al5001")).searchParams.get("codex"), "al5001");
});

test("only a real race status is a panel payload", () => {
  assert.equal(livePayloadOk({ status: "between_runs", codex: "al0001" }, "al0001"), true);
  assert.equal(livePayloadOk({ status: "live", codex: "al5001" }, "al5001"), true);
  assert.equal(livePayloadOk({ status: "scheduled", codex: "AL0001" }, "al0001"), true);
  assert.equal(livePayloadOk({ status: "finished", codex: "al0001" }, "al0001"), true);
  assert.equal(livePayloadOk({ status: "upstream_error", codex: "al0001" }, "al0001"), false);
  assert.equal(livePayloadOk({ status: "not_found", codex: "cc0578" }, "cc0578"), false);
  assert.equal(livePayloadOk({ status: "live", codex: "al5001" }, "al0001"), false);
  assert.equal(livePayloadOk(null, "al0001"), false);
});

test("poll cadence follows the run, the tab, and relay errors", () => {
  assert.equal(pollDelay("live"), 5_000);
  assert.equal(pollDelay("scheduled"), 5_000);
  assert.equal(pollDelay("between_runs"), 60_000);
  assert.equal(pollDelay("finished"), null);
  assert.equal(pollDelay("live", { hidden: true }), null);
  assert.equal(pollDelay("between_runs", { hidden: true }), null);
  assert.equal(pollDelay(null, { pulsing: true }), 5_000);
  assert.equal(pollDelay(null, { pulsing: false }), 60_000);
  assert.equal(pollDelay("live", { error: "upstream_error" }), 5_000);
  assert.equal(pollDelay("between_runs", { error: "http" }), 60_000);
  assert.equal(pollDelay(null, { error: "http", pulsing: false }), 60_000);
  assert.equal(pollDelay(null, { error: "not_found", pulsing: true }), 60_000);
  assert.equal(pollDelay("finished", { error: "http" }), null);
});

test("a finished relay replaces Underway on the race card", () => {
  const official = { status: "finished", message: "Race completed - Official results" };
  assert.equal(cardStatus("Underway", official), "Finished");
  assert.equal(cardStatus("Underway", { status: "finished" }), "Finished");
  assert.equal(cardStatus("Starts in 3m 00s", official), "Finished");
  assert.equal(cardStatus("Run 1 done · Run 2 at 1:30 PM CET", official), "Finished");
  assert.equal(cardStatus("Underway", { status: "live" }), "Underway");
  assert.equal(cardStatus("Starts in 3m 00s", { status: "live" }), "Underway");
  assert.equal(cardStatus("Run 1 done · Run 2 at 1:30 PM CET", { status: "between_runs" }), "Run 1 done · Run 2 at 1:30 PM CET");
  assert.equal(cardStatus("Underway", { status: "between_runs" }), "Between runs");
  assert.equal(cardStatus("Starts in 10m 00s", { status: "scheduled" }), "Starts in 10m 00s");
  assert.equal(cardStatus("Underway", { status: "scheduled" }), "Scheduled");
  assert.equal(cardStatus("Underway", null), "Underway");
  assert.equal(cardStatus("Underway", { status: "not_found" }), "Underway");
});

test("updated stamp counts seconds from fetchedAt", () => {
  const now = new Date("2026-10-25T11:33:20.000Z");
  assert.equal(updatedAgo("2026-10-25T11:33:12.611Z", now), "updated 7 s ago");
  assert.equal(updatedAgo("2026-10-25T11:33:20.000Z", now), "updated 0 s ago");
  assert.equal(updatedAgo("2026-10-25T11:34:00.000Z", now), "updated 0 s ago");
  assert.equal(updatedAgo("nope", now), "");
});

test("gaps use the relay diff, otherwise the clock", () => {
  assert.equal(parseRaceTime("52.40"), 52400);
  assert.equal(parseRaceTime("2:14.82"), 134820);
  assert.equal(parseRaceTime("1:02.03"), 62030);
  assert.equal(parseRaceTime(""), null);
  assert.equal(formatDiff(0), "0.00");
  assert.equal(formatDiff(830), "+0.83");
  assert.equal(formatDiff(2990), "+2.99");
  assert.equal(formatDiff(62100), "+1:02.10");
  assert.equal(athleteDiff({ diff: "+0.83", time: "2:15.65" }, { time: "2:14.82" }), "+0.83");
  assert.equal(
    athleteDiff({ time: "55.39", rank: 59, nation: "AUT" }, leader),
    "+2.99",
  );
  assert.equal(athleteDiff({ status: "dnf" }, leader), "");
});

test("panel slices on-course, the next three, and the top 10", () => {
  const payload = {
    run: 1,
    runs: 2,
    onCourse: [],
    nextOnCourse: [
      { pos: 1, bib: 18, name: "Anton GRAMMEL", nation: "GER" },
      { pos: 2, bib: 49, name: "Rasmus BAKKEVIG", nation: "NOR" },
      { pos: 3, bib: 20, name: "Alban ELEZI CANNAFERINA", nation: "FRA" },
      { pos: 4, bib: 43, name: "Lenz HAECHLER", nation: "SUI" },
      { pos: 5, bib: 55, name: "Eduard HALLBERG", nation: "FIN" },
    ],
    results: Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, name: `R${i + 1}` })),
    counts: { starters: 69, finished: 65, dnf: 4, remaining: 0 },
  };
  assert.deepEqual(onCourse(payload), []);
  assert.deepEqual(nextStarters(payload).map((row) => row.bib), [18, 49, 20]);
  assert.equal(topResults(payload).length, 10);
  assert.equal(topResults(payload)[0].rank, 1);
  assert.equal(runLabel(payload), "Run 1 of 2");
  assert.equal(timesNote(payload), "");
  assert.equal(timesNote({ run: 2, runs: 2 }), "Run 2 times are combined totals.");
  assert.equal(
    timesNote({ run: 2, timesNote: "Run 2+ times are cumulative (total) times, as FIS reports them" }),
    "Run 2+ times are cumulative (total) times, as FIS reports them",
  );
  assert.equal(countsLine(payload), "65 of 69 finished · 4 DNF");
  assert.equal(nationFlag("BRA"), "🇧🇷");
  assert.equal(nationFlag("SUI"), "🇨🇭");
  assert.equal(nationFlag("USA"), "🇺🇸");
  assert.equal(nationFlag("ZZZ"), "");
});
