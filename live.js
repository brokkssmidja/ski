/** Live standings from the public FIS timing relay. Pure helpers; the page polls. */

export const LIVE_RELAY = "https://relay.olaforsstromolsson.workers.dev/fis/live";

const LIVE_STATUS = new Set(["scheduled", "live", "between_runs", "finished"]);

const STATUS_LABEL = {
  scheduled: "Scheduled",
  live: "Live",
  between_runs: "Between runs",
  finished: "Finished",
};

/** IOC nation code to ISO 3166-1 alpha-2, for flag emoji. */
const NATION = {
  ALB: "AL", AND: "AD", ARG: "AR", ARM: "AM", AUS: "AU", AUT: "AT", BEL: "BE", BIH: "BA",
  BLR: "BY", BOL: "BO", BRA: "BR", BUL: "BG", CAN: "CA", CHI: "CL", CHN: "CN", CRO: "HR",
  CYP: "CY", CZE: "CZ", DEN: "DK", ESP: "ES", EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB",
  GEO: "GE", GER: "DE", GRE: "GR", HUN: "HU", IRL: "IE", ISL: "IS", ISR: "IL", ITA: "IT",
  JPN: "JP", KAZ: "KZ", KOR: "KR", LAT: "LV", LIE: "LI", LTU: "LT", LUX: "LU", MDA: "MD",
  MEX: "MX", MKD: "MK", MNE: "ME", MON: "MC", NED: "NL", NOR: "NO", NZL: "NZ", POL: "PL",
  POR: "PT", ROU: "RO", RSA: "ZA", RUS: "RU", SLO: "SI", SRB: "RS", SUI: "CH", SVK: "SK",
  SWE: "SE", TUR: "TR", UKR: "UA", USA: "US", UZB: "UZ",
};

export function relayUrl(codex) {
  const url = new URL(LIVE_RELAY);
  url.searchParams.set("codex", codex);
  url.searchParams.set("top", "10");
  url.searchParams.set("next", "5");
  return url.toString();
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || "";
}

/**
 * Status line on the race card.
 * A relay payload replaces the clock. Finished, including official results, is "Finished",
 * so the card does not keep saying Underway after the race is over.
 * Scheduled keeps a start countdown, which the relay status does not carry.
 * Anything else with no payload is left to the caller.
 */
export function cardStatus(timeStatus, payload) {
  const clock = timeStatus || "";
  if (!payload || !LIVE_STATUS.has(payload.status)) return clock;
  if (payload.status === "finished") return "Finished";
  if (payload.status === "live") return "Underway";
  if (payload.status === "between_runs") {
    if (clock.startsWith("Run 1 done")) return clock;
    return "Between runs";
  }
  if (payload.status === "scheduled" && (clock.startsWith("Starts in") || clock === "Time TBA")) {
    return clock;
  }
  if (payload.status === "scheduled") return "Scheduled";
  return clock;
}

/** A standings payload the panel can render. Error objects from the relay are not. */
export function livePayloadOk(data, codex) {
  if (!data || typeof data !== "object") return false;
  if (!LIVE_STATUS.has(data.status)) return false;
  if (codex && data.codex && String(data.codex).toLowerCase() !== String(codex).toLowerCase()) {
    return false;
  }
  return true;
}

/**
 * Milliseconds until the next poll, or null to stop.
 * 5s while a run is live or scheduled and the tab is visible.
 * 60s between runs. Stop when the relay says finished, or the tab is hidden.
 * An error hides the panel; retry soon during a run, and slowly otherwise.
 * `not_found` always waits 60s so an unmapped codex is not polled every 5s.
 */
export function pollDelay(status, { hidden = false, pulsing = false, error = null } = {}) {
  if (hidden || status === "finished") return null;
  if (error === "not_found") return 60_000;
  if (status === "between_runs") return 60_000;
  if (status === "live" || status === "scheduled") return 5_000;
  if (error) return pulsing ? 5_000 : 60_000;
  return pulsing ? 5_000 : 60_000;
}

/** "updated 12 s ago", from the relay's fetchedAt. */
export function updatedAgo(fetchedAt, now) {
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  return `updated ${seconds} s ago`;
}

/** Race time to milliseconds. Accepts "52.40", "2:14.82", and "1:02:03.10". */
export function parseRaceTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return null;
  const nums = parts.map(Number);
  let seconds = nums[nums.length - 1];
  if (nums.length >= 2) seconds += nums[nums.length - 2] * 60;
  if (nums.length === 3) seconds += nums[0] * 3600;
  const ms = Math.round(seconds * 1000);
  return Number.isFinite(ms) ? ms : null;
}

/** Signed gap such as "+0.83" or "+1:02.10". */
export function formatDiff(ms) {
  if (!Number.isFinite(ms)) return "";
  const sign = ms > 0 ? "+" : ms < 0 ? "-" : "";
  const abs = Math.abs(Math.round(ms));
  const frac = String(abs % 1000).padStart(3, "0").slice(0, 2);
  const totalSeconds = Math.floor(abs / 1000);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60);
  const body = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}.${frac}` : `${secs}.${frac}`;
  return `${sign}${body}`;
}

/** Prefer the relay diff. Otherwise the gap to the leader, from timeMs or the clock. */
export function athleteDiff(athlete, leader) {
  if (athlete && typeof athlete.diff === "string" && athlete.diff) return athlete.diff;
  const mine = Number.isFinite(athlete?.timeMs) ? athlete.timeMs : parseRaceTime(athlete?.time);
  const theirs = Number.isFinite(leader?.timeMs) ? leader.timeMs : parseRaceTime(leader?.time);
  if (mine == null || theirs == null) return "";
  return formatDiff(mine - theirs);
}

export function nationFlag(code) {
  const iso = NATION[code];
  if (!iso) return "";
  return [...iso].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

export function onCourse(payload) {
  return Array.isArray(payload?.onCourse) ? payload.onCourse.filter(Boolean) : [];
}

/** The relay is asked for five; the panel shows the next three starters. */
export function nextStarters(payload, limit = 3) {
  const list = Array.isArray(payload?.nextOnCourse) ? payload.nextOnCourse.filter(Boolean) : [];
  return list.slice(0, limit);
}

export function topResults(payload, limit = 10) {
  const list = Array.isArray(payload?.results) ? payload.results.filter(Boolean) : [];
  return list.slice(0, limit);
}

export function runLabel(payload) {
  if (!payload?.run) return "";
  if (payload.runs) return `Run ${payload.run} of ${payload.runs}`;
  return `Run ${payload.run}`;
}

/** Run 2 and later are combined totals. Prefer the relay note when it sends one. */
export function timesNote(payload) {
  if (typeof payload?.timesNote === "string" && payload.timesNote.trim()) return payload.timesNote.trim();
  if (Number(payload?.run) >= 2) return "Run 2 times are combined totals.";
  return "";
}

export function countsLine(payload) {
  const counts = payload?.counts;
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  if (counts.starters != null && counts.finished != null) {
    parts.push(`${counts.finished} of ${counts.starters} finished`);
  } else if (counts.finished != null) {
    parts.push(`${counts.finished} finished`);
  }
  if (counts.dnf) parts.push(`${counts.dnf} DNF`);
  if (counts.remaining) parts.push(`${counts.remaining} remaining`);
  return parts.join(" · ");
}

/** Remembered TV delay. Per race codex, dropped after 12 hours. */
export const TV_DELAY_KEY = "ski-tv-delay";
export const TV_DELAY_MAX_MS = 20 * 60 * 1000;
export const TV_DELAY_TTL_MS = 12 * 60 * 60 * 1000;
export const TV_NUDGE_MS = 5_000;

/**
 * Wall-clock start, when the payload actually carries one.
 * Checked against the live relay during the Levi women's slalom (14 Nov 2026, codex al5002):
 * onCourse is only bib, name, and nation; nextOnCourse adds pos and next; results add the
 * running time. There is no start clock. The FIS livetiming file behind the relay is the same:
 * splits are running time from each skier's own start, and the only clock is the run start.
 * Callers fall back to the first moment this page sees the skier in onCourse.
 */
const START_AT_KEYS = ["startTime", "startedAt", "startAt", "gateTime"];
const START_MS_KEYS = ["startMs", "startedAtMs", "gateMs"];

export function skierId(person) {
  if (!person || typeof person !== "object") return "";
  if (person.bib != null && String(person.bib) !== "") return `bib:${person.bib}`;
  if (person.name) return `name:${String(person.name)}`;
  return "";
}

export function explicitStartMs(person) {
  if (!person || typeof person !== "object") return null;
  for (const key of START_MS_KEYS) {
    const n = Number(person[key]);
    if (Number.isFinite(n) && n > 1e11) return Math.round(n);
  }
  for (const key of START_AT_KEYS) {
    const raw = person[key];
    if (typeof raw === "number" && raw > 1e11) return Math.round(raw);
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function emptyStartLog() {
  return { primed: false, seen: {}, starters: {} };
}

function startStamp(person, run, at, source, partial) {
  return {
    at,
    source,
    partial: !!partial,
    run,
    bib: person.bib,
    name: person.name || "",
    nation: person.nation || person.country || "",
  };
}

/**
 * Remember when each skier leaves the start.
 * The first payload only marks who is already on course (partial: the gate was missed).
 * A later poll that newly lists them records that arrival. An explicit start clock replaces either.
 */
export function observeStarts(log, payload, observedAt) {
  const prev = log && typeof log === "object" ? log : emptyStartLog();
  const run = Number(payload?.run) || 0;
  const seen = { ...prev.seen };
  const starters = { ...prev.starters };
  for (const person of onCourse(payload)) {
    const id = skierId(person);
    if (!id) continue;
    const key = `${run}:${id}`;
    const exact = explicitStartMs(person);
    if (exact != null) {
      starters[key] = startStamp(person, run, exact, "start", false);
      seen[key] = true;
      continue;
    }
    if (!seen[key]) {
      starters[key] = startStamp(person, run, observedAt, "onCourse", !prev.primed);
      seen[key] = true;
    }
  }
  return { primed: true, seen, starters };
}

export function startFor(log, run, person) {
  const id = skierId(person);
  if (!id || !log?.starters) return null;
  return log.starters[`${Number(run) || 0}:${id}`] || null;
}

/** Tap time minus the skier's start. Early taps stay at 0. Capped at 20 minutes. */
export function delayFromTap(tapAt, startAt) {
  if (!Number.isFinite(tapAt) || !Number.isFinite(startAt)) return null;
  const delay = Math.round(tapAt - startAt);
  if (delay <= 0) return 0;
  return Math.min(TV_DELAY_MAX_MS, delay);
}

export function nudgeDelay(delayMs, deltaMs) {
  const base = Number.isFinite(delayMs) ? delayMs : 0;
  const next = base + (Number(deltaMs) || 0);
  if (next <= 0) return 0;
  return Math.min(TV_DELAY_MAX_MS, Math.round(next));
}

/** "0:42" or "1:05". */
export function formatTvDelay(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function holdMessage(waitMs) {
  return `Holding results for ${formatTvDelay(waitMs)} so a reload stays behind the TV.`;
}

/**
 * Skiers who have already left the start in the snapshot on screen.
 * Excludes anyone still listed on course or in the next starters, who have their own Sync button.
 */
export function recentStarters(log, { run, asOf, limit = 4, exclude = [] } = {}) {
  const skip = new Set(exclude.filter(Boolean));
  const starters = log?.starters ? Object.values(log.starters) : [];
  return starters
    .filter((starter) => (
      starter
      && starter.at != null
      && (run == null || starter.run === run)
      && starter.at <= asOf
      && !skip.has(skierId(starter))
    ))
    .sort((a, b) => b.at - a.at || String(a.bib).localeCompare(String(b.bib)))
    .slice(0, limit);
}

/** A Sync tap is safe once the snapshot on screen has reached that start. */
export function syncReady(log, run, person, viewAt) {
  const starter = startFor(log, run, person);
  if (!starter || starter.at == null || !Number.isFinite(viewAt) || starter.at > viewAt) return null;
  return starter;
}

export function pushSnapshot(buffer, payload, at) {
  const list = Array.isArray(buffer) ? buffer : [];
  const next = list.length && list[list.length - 1].at === at ? list.slice(0, -1) : list.slice();
  next.push({ at, payload });
  return next;
}

/** Keep enough history to replay the maximum TV delay, including one frame at the edge. */
export function pruneSnapshots(buffer, now, keepMs = TV_DELAY_MAX_MS) {
  const list = Array.isArray(buffer) ? buffer : [];
  const cutoff = now - keepMs;
  let index = 0;
  while (index < list.length - 1 && list[index + 1].at <= cutoff) index += 1;
  return index ? list.slice(index) : list.slice();
}

/**
 * The payload to draw at broadcast time.
 * Not ready until the page has been collecting snapshots for the whole delay,
 * so a reload cannot flash the live result.
 */
export function snapshotAt(buffer, now, delayMs, openedAt = now) {
  const list = Array.isArray(buffer) ? buffer : [];
  const delay = Math.max(0, Number(delayMs) || 0);
  if (!list.length) {
    if (delay === 0) return { payload: null, at: null, ready: true, holdUntil: null };
    const holdUntil = openedAt + delay;
    if (now >= holdUntil) return { payload: null, at: null, ready: true, holdUntil: null };
    return { payload: null, at: null, ready: false, holdUntil, waitMs: holdUntil - now };
  }
  if (delay === 0) {
    const last = list[list.length - 1];
    return { payload: last.payload, at: last.at, ready: true, holdUntil: null };
  }
  const target = now - delay;
  if (list[0].at > target) {
    const holdUntil = list[0].at + delay;
    return { payload: null, at: null, ready: false, holdUntil, waitMs: Math.max(0, holdUntil - now) };
  }
  let chosen = list[0];
  for (const snap of list) {
    if (snap.at <= target) chosen = snap;
    else break;
  }
  return { payload: chosen.payload, at: chosen.at, ready: true, holdUntil: null };
}

export function parseTvDelay(raw, codex, now) {
  if (!raw || !codex || !Number.isFinite(now)) return 0;
  let data;
  try { data = JSON.parse(raw); } catch { return 0; }
  if (!data || typeof data !== "object") return 0;
  if (String(data.codex).toLowerCase() !== String(codex).toLowerCase()) return 0;
  const savedAt = Number(data.savedAt);
  const delayMs = Number(data.delayMs);
  if (!Number.isFinite(savedAt) || !Number.isFinite(delayMs)) return 0;
  if (now - savedAt > TV_DELAY_TTL_MS || savedAt - now > 60_000) return 0;
  if (delayMs <= 0) return 0;
  return Math.min(TV_DELAY_MAX_MS, Math.round(delayMs));
}

export function serializeTvDelay(codex, delayMs, now) {
  return JSON.stringify({
    codex,
    delayMs: Math.min(TV_DELAY_MAX_MS, Math.max(0, Math.round(Number(delayMs) || 0))),
    savedAt: now,
  });
}
