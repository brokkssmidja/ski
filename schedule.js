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

const COUNTRY = {
  AND: "Andorra", AUT: "Austria", CAN: "Canada", FIN: "Finland", FRA: "France",
  GER: "Germany", ITA: "Italy", NOR: "Norway", SLO: "Slovenia", SUI: "Switzerland",
  SVK: "Slovakia", SWE: "Sweden", USA: "United States",
};

/**
 * Chip filters are booleans: { alpine, xc, men, women }.
 * The older { sport, gender } shape still works for the schedule tests.
 */
export function matches(race, filters) {
  if (!filters) return true;
  if (typeof filters.sport === "string" || typeof filters.gender === "string") {
    if (filters.sport && filters.sport !== "all" && race.sport !== filters.sport) return false;
    if (filters.gender === "men" && race.gender === "women") return false;
    if (filters.gender === "women" && race.gender === "men") return false;
    return true;
  }
  if (filters[race.sport] === false) return false;
  if (race.gender === "mixed") return filters.men !== false || filters.women !== false;
  return filters[race.gender] !== false;
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

export function isTechnical(race) {
  return race.discipline === "Slalom" || race.discipline === "Giant Slalom";
}

/** Eastern Time lines for a race. Slalom and GS keep run 1 and run 2 together. */
export function startLines(race) {
  const times = instants(race);
  if (!times.length) return ["Time TBA"];
  if (isTechnical(race) && times.length >= 2) {
    return [`Run 1 · ${formatET(times[0])}`, `Run 2 · ${formatET(times[1])}`];
  }
  return times.map((time) => formatET(time));
}

function utcNoon(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function weekday(iso) {
  return utcNoon(iso).getUTCDay();
}

function formatShort(iso) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(iso)).replace(/\u202f/g, " ");
}

function formatDateHeading(iso) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(iso)).replace(/\u202f/g, " ");
}

function mondayOnOrBefore(iso) {
  const dow = weekday(iso);
  const delta = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -delta);
}

/** Saturday and Sunday still ahead of an Eastern Time calendar day. Sunday returns none. */
export function thisWeekend(today) {
  const dow = weekday(today);
  if (dow === 0) return [];
  if (dow === 6) return [addDays(today, 1)];
  const sat = addDays(today, 6 - dow);
  return [sat, addDays(sat, 1)];
}

/** Eastern Time calendar day of the first start, or the FIS date when the start is TBA. */
export function raceDay(race) {
  const times = instants(race);
  if (times.length) return etDate(times[0].toISOString());
  return race.date;
}

/**
 * Group an already-filtered upcoming list.
 * Today, then any weekdays before the weekend, then This weekend, then Monday–Sunday ranges.
 */
export function groupUpcoming(races, now) {
  const today = etDate(now.toISOString());
  const weekend = new Set(thisWeekend(today));
  const firstWeekend = [...weekend].sort()[0];
  const groups = [];
  const index = new Map();

  function bucket(key, title) {
    let group = index.get(key);
    if (!group) {
      group = { key, title, races: [] };
      index.set(key, group);
      groups.push(group);
    }
    return group;
  }

  for (const race of races) {
    const day = raceDay(race);
    if (day === today) bucket("today", "Today").races.push(race);
    else if (weekend.has(day)) bucket("weekend", "This weekend").races.push(race);
    else if (firstWeekend && day > today && day < firstWeekend) {
      bucket(`day-${day}`, formatDateHeading(day)).races.push(race);
    } else {
      const start = mondayOnOrBefore(day);
      const end = addDays(start, 6);
      bucket(`week-${start}`, `${formatShort(start)} – ${formatShort(end)}`).races.push(race);
    }
  }

  for (const group of groups) group.races.sort(bySchedule);
  groups.sort((a, b) => bySchedule(a.races[0], b.races[0]));
  return groups;
}

function icsEscape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcs(lines) {
  const encoder = new TextEncoder();
  const out = [];
  for (const line of lines) {
    let rest = line;
    while (encoder.encode(rest).length > 75) {
      let bytes = 0;
      let cut = 0;
      for (const ch of rest) {
        const size = encoder.encode(ch).length;
        if (cut > 0 && bytes + size > 75) break;
        bytes += size;
        cut += ch.length;
      }
      out.push(rest.slice(0, cut));
      rest = ` ${rest.slice(cut)}`;
    }
    out.push(rest);
  }
  return `${out.join("\r\n")}\r\n`;
}

export function icsFilename(race) {
  const slug = `${race.gender}-${race.discipline}-${race.venue}-${race.date}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}.ics`;
}

/** One VEVENT. Timed races run from the first start until 2.5h after the last. TBA is all-day. */
export function icsFor(race, now = new Date()) {
  const times = instants(race);
  const who = race.gender === "men" ? "Men's" : race.gender === "women" ? "Women's" : "Mixed";
  const summary = `${who} ${race.discipline} — ${race.venue}`;
  const description = [
    ...startLines(race),
    race.watch,
    race.note,
    "https://brokkssmidja.github.io/ski/",
  ].filter(Boolean).join("\n");
  const place = COUNTRY[race.country] ? `${race.venue}, ${COUNTRY[race.country]}` : race.venue;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//brokkssmidja//World Cup//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${race.id}@brokkssmidja.github.io`,
    `DTSTAMP:${icsStamp(now)}`,
  ];
  if (!times.length) {
    const end = addDays(race.date, 1).replace(/-/g, "");
    lines.push(`DTSTART;VALUE=DATE:${race.date.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    const last = times[times.length - 1];
    lines.push(`DTSTART:${icsStamp(times[0])}`);
    lines.push(`DTEND:${icsStamp(new Date(last.getTime() + LIVE_MS))}`);
  }
  lines.push(
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(place)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return foldIcs(lines);
}
