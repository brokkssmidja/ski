/** View model for the race page. Pure functions; the page paints them. */

import { formatDiff } from "./live.js";
import { displayName } from "./results.js";

const SHORT = {
  Slalom: "sl",
  "Giant Slalom": "gs",
  Downhill: "dh",
  "Super-G": "sg",
  Halfpipe: "hp",
  "Halfpipe Qualification": "hp-q",
  Slopestyle: "ss",
  "Slopestyle Qualification": "ss-q",
  "Big Air": "ba",
  "Big Air Qualification": "ba-q",
};

const DONE = new Set(["finish", "dnf", "dns", "dsq", "dq", "dqf"]);

function venueSlug(venue) {
  return String(venue || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function discSlug(discipline) {
  if (SHORT[discipline]) return SHORT[discipline];
  const text = String(discipline || "");
  if (/relay/i.test(text)) return "relay";
  const km = /^(\d+(?:\.\d+)?)\s*km/i.exec(text);
  const bits = [];
  if (km) bits.push(`${km[1].replace(".", "")}k`);
  if (/sprint/i.test(text)) bits.push("sprint");
  if (/skiathlon/i.test(text)) bits.push("skiathlon");
  if (/pursuit/i.test(text)) bits.push("pursuit");
  return bits.join("-") || "race";
}

function genderSlug(gender) {
  if (gender === "women" || gender === "men" || gender === "mixed") return gender;
  return "open";
}

/** Readable hash. A repeated venue and discipline gets the month and day. */
export function raceSlug(race, races = []) {
  const base = `${venueSlug(race.venue)}-${discSlug(race.discipline)}-${genderSlug(race.gender)}`;
  const twins = races.filter((item) => (
    venueSlug(item.venue) === venueSlug(race.venue)
    && discSlug(item.discipline) === discSlug(race.discipline)
    && genderSlug(item.gender) === genderSlug(race.gender)
  ));
  if (twins.length <= 1) return base;
  const day = String(race.date || "").slice(5).replace("-", "");
  return day ? `${base}-${day}` : `${base}-${race.id}`;
}

export function findRace(hash, races) {
  const id = String(hash || "").replace(/^#/, "").trim().toLowerCase();
  if (!id) return null;
  return races.find((race) => race.id === id || raceSlug(race, races) === id) || null;
}

export function timingXmlUrl(codex) {
  if (!/^al\d{4}$/i.test(String(codex || ""))) return "";
  return `https://live.fis-ski.com/${String(codex).toLowerCase()}/main.xml`;
}

export function ordinal(n) {
  const value = Math.abs(Number(n)) || 0;
  const teen = value % 100;
  if (teen >= 11 && teen <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

export function formatRunTime(ms) {
  if (!Number.isFinite(ms)) return "";
  const total = Math.max(0, Math.round(ms));
  const frac = String(total % 1000).padStart(3, "0").slice(0, 2);
  const seconds = Math.floor(total / 1000);
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}.${frac}`;
  }
  return `${seconds}.${frac}`;
}

function phpParse(source, index = 0) {
  const type = source[index];
  if (type === "N") return [null, index + 2];
  if (type === "b") return [source[index + 2] === "1", index + 4];
  if (type === "i") {
    const end = source.indexOf(";", index + 2);
    return [Number(source.slice(index + 2, end)), end + 1];
  }
  if (type === "d") {
    const end = source.indexOf(";", index + 2);
    return [Number(source.slice(index + 2, end)), end + 1];
  }
  if (type === "s") {
    const colon = source.indexOf(":", index + 2);
    const length = Number(source.slice(index + 2, colon));
    const start = colon + 2;
    return [source.slice(start, start + length), start + length + 2];
  }
  if (type === "a") {
    const colon = source.indexOf(":", index + 2);
    const count = Number(source.slice(index + 2, colon));
    let cursor = colon + 2;
    const out = {};
    for (let i = 0; i < count; i += 1) {
      const [key, next] = phpParse(source, cursor);
      cursor = next;
      const [value, after] = phpParse(source, cursor);
      cursor = after;
      out[key] = value;
    }
    return [out, cursor + 1];
  }
  throw new Error(`bad timing byte ${type} at ${index}`);
}

function list(node) {
  if (!node || typeof node !== "object") return [];
  return Object.keys(node)
    .filter((key) => /^\d+$/.test(String(key)))
    .map(Number)
    .sort((a, b) => a - b)
    .map((key) => node[key]);
}

function splitsOf(node) {
  return list(node).map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Alpine livetiming main.xml. The relay only sends who is next, not the whole start list
 * or the run 1 time. This file has both, and live.fis-ski.com allows any site to read it.
 * Returns null when the document is not that feed.
 */
export function parseTimingXml(xml) {
  const text = String(xml || "");
  const start = text.indexOf("<lt>");
  const end = text.lastIndexOf("</lt>");
  if (start < 0 || end < 0) return null;
  let root;
  try {
    [root] = phpParse(text.slice(start + 4, end));
  } catch {
    return null;
  }
  const byId = new Map();
  for (const racer of list(root?.racers)) {
    if (!racer || racer[0] == null) continue;
    byId.set(racer[0], {
      id: racer[0],
      last: racer[1] || "",
      first: racer[2] || "",
      nation: racer[3] || "",
    });
  }
  const startRuns = root?.startlist?.[0]?.[0];
  const resultRuns = root?.result?.[0];
  if (!startRuns) return null;
  const run1Times = new Map();
  const run1Rows = [];
  const runIndexes = list(startRuns).map((_, index) => index);
  const runs = runIndexes.map((runIndex) => {
    const entries = list(startRuns[runIndex]);
    const times = list(resultRuns?.[runIndex]);
    return entries.map((entry, index) => {
      const who = byId.get(entry?.[0]) || {};
      const split = splitsOf(times[index]);
      const status = String(entry?.[2] || "").toLowerCase();
      const finished = status === "finish" && split.length > 0;
      const timeMs = finished ? split[split.length - 1] : null;
      const athlete = {
        id: entry?.[0] ?? null,
        bib: entry?.[1] ?? "",
        name: displayName(`${who.last || ""} ${who.first || ""}`.trim()),
        nation: who.nation || "",
        status,
        order: index,
        timeMs,
      };
      if (runIndex === 0 && finished) run1Rows.push(athlete);
      return athlete;
    });
  });
  const best = run1Rows.reduce((min, row) => (row.timeMs < min ? row.timeMs : min), Infinity);
  run1Rows.sort((a, b) => a.timeMs - b.timeMs);
  run1Rows.forEach((row, index) => {
    run1Times.set(row.id, {
      timeMs: row.timeMs,
      time: formatRunTime(row.timeMs),
      rank: index + 1,
      diff: formatDiff(row.timeMs - best),
    });
  });
  for (const run of runs) {
    for (const athlete of run) {
      athlete.run1 = run1Times.get(athlete.id) || null;
    }
  }
  return {
    message: typeof root.message === "string" ? root.message : "",
    runs,
  };
}

export function highlightNation(nation) {
  return nation === "NOR" || nation === "SWE";
}

function athleteNote(athlete, run) {
  if (Number(run) < 2 || !athlete?.run1?.rank) return "";
  return `was ${ordinal(athlete.run1.rank)} after run 1`;
}

function comingLine(athlete, run) {
  const run1 = Number(run) >= 2 ? athlete.run1 : null;
  if (!run1) return "";
  return [run1.time, ordinal(run1.rank), run1.rank === 1 ? "" : run1.diff].filter(Boolean).join(" · ");
}

export function stillToCome(field, { run = 1, onCourse = [], limit = Infinity } = {}) {
  const list = field?.runs?.[Math.max(0, Number(run) - 1)] || [];
  const skiing = new Set(onCourse.map((person) => String(person?.bib ?? person)));
  const waiting = list.filter((athlete) => !DONE.has(athlete.status) && !skiing.has(String(athlete.bib)));
  const total = waiting.length;
  return waiting.slice(0, limit).map((athlete, index) => ({
    n: index + 1,
    total,
    bib: athlete.bib,
    name: athlete.name,
    nation: athlete.nation,
    run1: comingLine(athlete, run),
    highlight: highlightNation(athlete.nation),
    label: `${index + 1} of ${total}`,
  }));
}

export function onCourseCards(payload, field) {
  const run = Number(payload?.run) || 1;
  const list = field?.runs?.[Math.max(0, run - 1)] || [];
  const byBib = new Map(list.map((athlete) => [String(athlete.bib), athlete]));
  return (Array.isArray(payload?.onCourse) ? payload.onCourse : []).filter(Boolean).map((person) => {
    const known = byBib.get(String(person.bib));
    return {
      bib: person.bib ?? "",
      name: displayName(person.name || known?.name || ""),
      nation: person.nation || known?.nation || "",
      note: athleteNote(known, run),
      person,
    };
  });
}

export function statusModel(payload) {
  const counts = payload?.counts || {};
  const run = Number(payload?.run) || 0;
  const runs = Number(payload?.runs) || 0;
  const finished = Number(counts.finished);
  const starters = Number(counts.starters);
  const remaining = Number(counts.remaining);
  const dnf = Number(counts.dnf) || 0;
  const parts = [];
  if (payload?.status === "finished") parts.push("Finished");
  else if (payload?.status === "between_runs") parts.push("Between runs");
  if (run) parts.push(runs ? `Run ${run} of ${runs}` : `Run ${run}`);
  if (Number.isFinite(finished) && Number.isFinite(starters)) parts.push(`${finished} of ${starters} down`);
  if (Number.isFinite(remaining)) parts.push(`${remaining} to go`);
  const through = Number.isFinite(starters) && starters > 0 && Number.isFinite(remaining)
    ? Math.max(0, Math.min(1, (starters - remaining) / starters))
    : (Number.isFinite(starters) && starters > 0 && Number.isFinite(finished) ? (finished + dnf) / starters : 0);
  return {
    text: parts.filter(Boolean).join(" · "),
    progress: through,
    dnf: dnf ? `${dnf} DNF` : "",
  };
}

export function leaderModel(payload) {
  const leader = payload?.currentLeader;
  if (!leader) return null;
  const on = Array.isArray(payload.onCourse) ? payload.onCourse.length : 0;
  const remaining = Number(payload.counts?.remaining);
  const toBeat = (Number.isFinite(remaining) ? remaining : 0) + on;
  let note = "leading";
  if (payload.status === "finished") note = "winner";
  else if (toBeat > 0) note = `leading · ${toBeat} ${toBeat === 1 ? "skier" : "skiers"} to beat`;
  return {
    name: displayName(leader.name || ""),
    nation: leader.nation || "",
    time: leader.time || "",
    bib: leader.bib ?? "",
    note,
  };
}

export function finisherModel(payload) {
  const last = payload?.lastFinisher;
  if (!last) return null;
  const rank = Number(last.rank);
  if (rank === 1) {
    return {
      name: displayName(last.name || ""),
      nation: last.nation || "",
      time: last.time || "",
      delta: "NEW LEADER",
      tone: "good",
    };
  }
  const gap = last.diff || "";
  const place = rank ? ordinal(rank) : "";
  return {
    name: displayName(last.name || ""),
    nation: last.nation || "",
    time: last.time || "",
    delta: [gap, place].filter(Boolean).join(" → "),
    tone: gap.startsWith("-") ? "good" : "bad",
  };
}

export function resultRows(payload) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((row) => ({
    rank: row.rank ?? "",
    bib: row.bib ?? "",
    name: displayName(row.name || ""),
    nation: row.nation || "",
    mark: row.status && row.status !== "finish" ? String(row.status).toUpperCase() : [row.time, row.rank === 1 ? "" : row.diff].filter(Boolean).join("  "),
    dnf: row.status && row.status !== "finish",
  }));
}

export function badgeText(payload) {
  const leader = payload?.currentLeader;
  if (!leader?.name) return "Live";
  const time = leader.time ? ` ${leader.time}` : "";
  return `Live · ${displayName(leader.name)}${time}`;
}

/**
 * What to paint. A reload must not go blank while the TV delay buffer refills:
 * keep the cached screen until a snapshot is old enough to show.
 */
export function displayState({ snapshots = [], delayMs = 0, now = 0, cached = null } = {}) {
  const delay = Math.max(0, Number(delayMs) || 0);
  const target = now - delay;
  let chosen = null;
  for (const snap of snapshots) {
    if (snap && snap.at <= target) chosen = snap;
  }
  if (chosen) return { ...chosen, fromCache: false };
  if (cached?.payload) return { ...cached, fromCache: true };
  if (snapshots.length) return { ...snapshots[0], fromCache: false };
  return null;
}

export function ageLabel(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return "";
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return `last update ${seconds} s ago`;
}

function relayComing(payload) {
  const list = Array.isArray(payload?.nextOnCourse) ? payload.nextOnCourse : [];
  const total = Number(payload?.counts?.remaining) || list.length;
  return list.filter(Boolean).map((person, index) => ({
    n: index + 1,
    total,
    bib: person.bib ?? "",
    name: displayName(person.name || ""),
    nation: person.nation || "",
    run1: "",
    highlight: highlightNation(person.nation),
    label: `${index + 1} of ${total}`,
  }));
}

export function raceModel({ payload = null, field = null, at = null, now = Date.now(), judged = false } = {}) {
  const run = Number(payload?.run) || 1;
  const onCourse = payload ? onCourseCards(payload, field) : [];
  const coming = field
    ? stillToCome(field, { run, onCourse: payload?.onCourse || [] })
    : relayComing(payload);
  return {
    status: payload ? statusModel(payload) : { text: judged ? "Judged event" : "", progress: 0, dnf: "" },
    onCourse,
    coming,
    leader: payload ? leaderModel(payload) : null,
    last: payload ? finisherModel(payload) : null,
    results: payload ? resultRows(payload) : [],
    age: ageLabel(at, now),
    judged,
    clear: !onCourse.length,
  };
}
