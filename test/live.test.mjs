import assert from "node:assert/strict";
import test from "node:test";
import {
  athleteDiff,
  countsLine,
  delayFromTap,
  emptyStartLog,
  explicitStartMs,
  formatDiff,
  formatTvDelay,
  holdMessage,
  livePayloadOk,
  nationFlag,
  nextStarters,
  nudgeDelay,
  observeStarts,
  onCourse,
  parseRaceTime,
  parseTvDelay,
  pollDelay,
  pushSnapshot,
  pruneSnapshots,
  recentStarters,
  cardStatus,
  relayUrl,
  runLabel,
  serializeTvDelay,
  snapshotAt,
  startFor,
  syncReady,
  timesNote,
  topResults,
  updatedAgo,
  TV_DELAY_MAX_MS,
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

const lamure = { bib: 23, name: "Marie LAMURE", nation: "FRA" };
const holdener = { bib: 7, name: "Wendy HOLDENER", nation: "SUI" };

test("the relay shape has no start clock, so the first on-course sighting is the start", () => {
  assert.equal(explicitStartMs(lamure), null);
  assert.equal(explicitStartMs({ ...lamure, time: "54.20", timeMs: 54200 }), null);
  assert.equal(explicitStartMs({ ...lamure, startTime: "2026-11-14T12:36:02.000Z" }), Date.parse("2026-11-14T12:36:02.000Z"));
  assert.equal(explicitStartMs({ ...lamure, startMs: 1_700_000_000_000 }), 1_700_000_000_000);

  const first = {
    run: 2,
    onCourse: [lamure],
    nextOnCourse: [{ ...holdener, pos: 22, next: true }],
  };
  const joined = observeStarts(emptyStartLog(), first, 1_000);
  assert.equal(startFor(joined, 2, lamure).at, 1_000);
  assert.equal(startFor(joined, 2, lamure).partial, true);
  assert.equal(startFor(joined, 2, lamure).source, "onCourse");
  assert.equal(startFor(joined, 2, holdener), null);

  const second = observeStarts(joined, {
    run: 2,
    onCourse: [holdener],
    nextOnCourse: [],
  }, 5_000);
  assert.equal(startFor(second, 2, lamure).at, 1_000);
  assert.equal(startFor(second, 2, holdener).at, 5_000);
  assert.equal(startFor(second, 2, holdener).partial, false);

  const clocked = observeStarts(second, {
    run: 2,
    onCourse: [{ ...holdener, startTime: "2026-11-14T12:36:10.000Z" }],
  }, 9_000);
  assert.equal(startFor(clocked, 2, holdener).source, "start");
  assert.equal(startFor(clocked, 2, holdener).partial, false);
  assert.equal(startFor(clocked, 2, holdener).at, Date.parse("2026-11-14T12:36:10.000Z"));
  assert.equal(startFor(clocked, 1, holdener), null);
});

test("a sync tap is the gap from the start, and nudges stay in range", () => {
  assert.equal(delayFromTap(42_000, 0), 42_000);
  assert.equal(delayFromTap(1_000, 1_000), 0);
  assert.equal(delayFromTap(500, 1_000), 0);
  assert.equal(delayFromTap(TV_DELAY_MAX_MS + 5_000, 0), TV_DELAY_MAX_MS);
  assert.equal(delayFromTap(Number.NaN, 0), null);
  assert.equal(nudgeDelay(40_000, 5_000), 45_000);
  assert.equal(nudgeDelay(3_000, -5_000), 0);
  assert.equal(nudgeDelay(TV_DELAY_MAX_MS, 5_000), TV_DELAY_MAX_MS);
  assert.equal(formatTvDelay(42_000), "0:42");
  assert.equal(formatTvDelay(65_000), "1:05");
  assert.equal(formatTvDelay(0), "0:00");
  assert.equal(holdMessage(28_000), "Holding results for 0:28 so a reload stays behind the TV.");
});

test("sync stays disabled until the snapshot on screen reaches that start", () => {
  const log = observeStarts(observeStarts(emptyStartLog(), { run: 2, onCourse: [] }, 0), {
    run: 2,
    onCourse: [lamure],
  }, 10_000);
  assert.equal(syncReady(log, 2, lamure, 9_000), null);
  assert.equal(syncReady(log, 2, lamure, 10_000).at, 10_000);
  assert.deepEqual(
    recentStarters(log, { run: 2, asOf: 10_000, exclude: ["bib:23"] }).map((row) => row.bib),
    [],
  );
  const later = observeStarts(log, { run: 2, onCourse: [holdener] }, 20_000);
  assert.deepEqual(
    recentStarters(later, { run: 2, asOf: 20_000, exclude: ["bib:7"] }).map((row) => row.bib),
    [23],
  );
  assert.deepEqual(
    recentStarters(later, { run: 2, asOf: 15_000, exclude: [] }).map((row) => row.bib),
    [23],
  );
});

test("a delay replays an older snapshot and hides anything newer", () => {
  const early = { status: "live", run: 2, onCourse: [lamure], currentLeader: { bib: 1, time: "1:54.00" } };
  const finish = { status: "live", run: 2, onCourse: [], lastFinisher: { bib: 23, time: "1:55.10" } };
  let buffer = pushSnapshot([], early, 60_000);
  buffer = pushSnapshot(buffer, finish, 100_000);
  const behind = snapshotAt(buffer, 100_000, 40_000, 0);
  assert.equal(behind.ready, true);
  assert.equal(behind.payload.onCourse[0].bib, 23);
  assert.equal(behind.payload.lastFinisher, undefined);
  const held = snapshotAt(buffer, 70_000, 40_000, 0);
  assert.equal(held.ready, false);
  assert.equal(held.payload, null);
  assert.equal(held.holdUntil, 100_000);
  assert.equal(snapshotAt(buffer, 100_000, 0, 0).payload, finish);
  assert.equal(snapshotAt([], 50_000, 40_000, 20_000).ready, false);
  assert.equal(snapshotAt([], 70_000, 40_000, 20_000).ready, true);
  const pruned = pruneSnapshots(buffer, 100_000 + TV_DELAY_MAX_MS + 1_000);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].at, 100_000);
});

test("the TV delay is kept per race and expires", () => {
  const now = Date.parse("2026-11-15T13:00:00.000Z");
  const raw = serializeTvDelay("al0002", 42_000, now - 60_000);
  assert.equal(parseTvDelay(raw, "al0002", now), 42_000);
  assert.equal(parseTvDelay(raw, "AL0002", now), 42_000);
  assert.equal(parseTvDelay(raw, "al5002", now), 0);
  assert.equal(parseTvDelay(raw, "al0002", now + 13 * 60 * 60 * 1000), 0);
  assert.equal(parseTvDelay(serializeTvDelay("al0002", 0, now), "al0002", now), 0);
  assert.equal(parseTvDelay("nope", "al0002", now), 0);
  assert.equal(parseTvDelay(serializeTvDelay("al0002", TV_DELAY_MAX_MS + 50_000, now), "al0002", now), TV_DELAY_MAX_MS);
});
