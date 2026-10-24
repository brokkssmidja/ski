/** Race timing for the Lake Placid (America/New_York) schedule. */

export const ET = "America/New_York";
const LIVE_MS = 2.5 * 60 * 60 * 1000;
const GENDER_ORDER = { women: 0, men: 1, mixed: 2 };

export function zonedTimeToUtc(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let utc = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utc)).map((p) => [p.type, p.value]),
    );
    let hour = Number(parts.hour);
    let day = Number(parts.day);
    let month = Number(parts.month);
    let year = Number(parts.year);
    if (hour === 24) {
      hour = 0;
      const rolled = new Date(Date.UTC(year, month - 1, day + 1));
      year = rolled.getUTCFullYear();
      month = rolled.getUTCMonth() + 1;
      day = rolled.getUTCDate();
    }
    const got = Date.UTC(year, month - 1, day, hour, Number(parts.minute));
    const delta = want - got;
    if (delta === 0) return new Date(utc);
    utc += delta;
  }
  return new Date(utc);
}

export function tbaEnd(race) {
  const [y, m, d] = race.date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const iso = next.toISOString().slice(0, 10);
  return zonedTimeToUtc(iso, "00:00", race.tz);
}

export function instants(race) {
  return (race.starts || []).filter(Boolean).map((s) => new Date(s));
}

export function phase(race, now) {
  const times = instants(race);
  const t = now.getTime();
  if (times.length) {
    const first = times[0].getTime();
    const last = times[times.length - 1].getTime();
    if (t < first) return "upcoming";
    if (t < last + LIVE_MS) return "live";
    return "past";
  }
  return t < tbaEnd(race).getTime() ? "upcoming" : "past";
}

/** Known starts sort by the first gun. A time-TBA race sorts at the end of its local day. */
export function sortKey(race) {
  const times = instants(race);
  if (times.length) return times[0].getTime();
  return tbaEnd(race).getTime() - 1;
}

export function matches(race, filters) {
  if (filters.sport !== "all" && race.sport !== filters.sport) return false;
  if (filters.gender === "men" && race.gender === "women") return false;
  if (filters.gender === "women" && race.gender === "men") return false;
  return true;
}

function bySchedule(a, b) {
  const d = sortKey(a) - sortKey(b);
  if (d) return d;
  const g = GENDER_ORDER[a.gender] - GENDER_ORDER[b.gender];
  if (g) return g;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function nextRace(races, now, filters) {
  const open = races.filter((r) => matches(r, filters) && phase(r, now) !== "past");
  open.sort(bySchedule);
  return open[0] || null;
}

export function upcomingRaces(races, now, filters) {
  const hero = nextRace(races, now, filters);
  return races
    .filter((r) => matches(r, filters) && phase(r, now) !== "past" && r !== hero)
    .sort(bySchedule);
}

export function pastRaces(races, now, filters) {
  return races
    .filter((r) => matches(r, filters) && phase(r, now) === "past")
    .sort((a, b) => bySchedule(b, a));
}

export function formatET(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} ET`;
}

export function etDate(iso) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatRaceDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatMonth(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function countdown(target, now) {
  let ms = target.getTime() - now.getTime();
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

/** What the hero countdown is counting toward. */
export function countdownTarget(race, now) {
  const times = instants(race);
  if (!times.length) return null;
  const future = times.find((t) => t.getTime() > now.getTime());
  return future || null;
}
