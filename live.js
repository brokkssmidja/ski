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
