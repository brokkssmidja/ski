/** Race instants are UTC. Clocks and date headings use the viewer's time zone. */

const GENDER_ORDER = { women: 0, men: 1, mixed: 2 };

/** IANA zone of this device. */
export function viewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const OFFSET_LABEL = /^(?:GMT|UTC)[+-]/;

function dateParts(instant, timeZone, options, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatToParts(
    instant instanceof Date ? instant : new Date(instant),
  );
}

function partValue(parts, type) {
  return (parts.find((p) => p.type === type)?.value || "").replace(/[\u202f\u00a0]/g, " ");
}

/**
 * Short zone label such as EST, EDT, CET, or CEST.
 * en-US supplies US abbreviations. en-GB supplies European ones when en-US
 * would only give an offset. A GMT offset remains when neither locale has a short name.
 */
export function zoneLabel(instant, timeZone = viewerTimeZone()) {
  for (const locale of ["en-US", "en-GB"]) {
    const name = partValue(
      dateParts(instant, timeZone, { timeZoneName: "short" }, locale),
      "timeZoneName",
    );
    if (name && !OFFSET_LABEL.test(name)) return name;
  }
  return partValue(
    dateParts(instant, timeZone, { timeZoneName: "shortOffset" }),
    "timeZoneName",
  ) || timeZone;
}

/** Header label: the short name plus the IANA id from the device zone. */
export function zoneHeading(instant = new Date(), timeZone = viewerTimeZone()) {
  const short = zoneLabel(instant, timeZone);
  return short === timeZone ? timeZone : `${short} · ${timeZone}`;
}

function formatTimeOfDay(instant, timeZone) {
  const parts = dateParts(instant, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  });
  return `${partValue(parts, "hour")}:${partValue(parts, "minute")} ${partValue(parts, "dayPeriod").toUpperCase()}`;
}

/** Clock time in `timeZone`, with a short zone label. */
export function formatClock(instant, timeZone = viewerTimeZone()) {
  return `${formatTimeOfDay(instant, timeZone)} ${zoneLabel(instant, timeZone)}`;
}

/** Calendar day of an instant in `timeZone`, as YYYY-MM-DD. */
export function localDate(instant, timeZone = viewerTimeZone()) {
  const parts = dateParts(instant, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }, "en-CA");
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

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

const LIVE_LEAD_MS = 60 * 60 * 1000;
const LIVE_TAIL_MS = 4 * 60 * 60 * 1000;
const RUN_MS = 75 * 60 * 1000;
const SINGLE_RUN_MS = 2 * 60 * 60 * 1000;
const XC_RUN_MS = 90 * 60 * 1000;
/** Innsbruck's published big-air window is four hours. Other freeski finals use the same span. */
const FREESKI_RUN_MS = 4 * 60 * 60 * 1000;
const HERO_HOLD_MS = 3 * 60 * 60 * 1000;

/** Official live index for a sport. live.fis-ski.com has no discipline home of its own. */
const LIVE_HOME = {
  alpine: "https://www.fis-ski.com/DB/alpine-skiing/live.html",
  xc: "https://www.fis-ski.com/DB/cross-country/live.html",
  freeski: "https://www.fis-ski.com/DB/freestyle-freeski/freeski/live.html",
};

/**
 * Alpine timing is https://live.fis-ski.com/lv-alNNNN.htm.
 * Cross-country timing is https://live.fis-ski.com/cc-NNNN/results-pda.htm.
 * Freeski timing is https://live.fis-ski.com/lv-fssNNNN.htm (a judged scoreboard).
 * NNNN is the FIS competition codex, zero-padded. Without one, use that sport's live index.
 */
export function fisResultsUrl(race) {
  const match = /^(alpine|xc|freeski)-(\d+)$/.exec(race.id || "");
  if (!match) return null;
  const sector = match[1] === "alpine" ? "AL" : match[1] === "xc" ? "CC" : "FS";
  return `https://www.fis-ski.com/DB/general/results.html?sectorcode=${sector}&raceid=${match[2]}`;
}

export function liveHref(race) {
  const codex = race.codex;
  const pad = Number.isInteger(codex) && codex >= 0 && codex <= 9999
    ? String(codex).padStart(4, "0")
    : "";
  if (pad && race.sport === "alpine") return `https://live.fis-ski.com/lv-al${pad}.htm`;
  if (pad && race.sport === "xc") return `https://live.fis-ski.com/cc-${pad}/results-pda.htm`;
  if (pad && race.sport === "freeski") return `https://live.fis-ski.com/lv-fss${pad}.htm`;
  return LIVE_HOME[race.sport] || "https://www.fis-ski.com/DB/alpine-skiing/live.html";
}

/**
 * Relay id taken from the Live timing URL.
 * Alpine `lv-al0001.htm` is `al0001`. Cross-country `cc-0578/` is `cc0578`.
 * Freeski `lv-fss8000.htm` is a judged FSS scoreboard. The relay only accepts
 * timed ids such as al0001, so freeski stays unmapped and the standings panel stays off.
 */
export function liveCodex(race) {
  const href = liveHref(race);
  const alpine = /\/lv-(al\d{4})\.htm/.exec(href);
  if (alpine) return alpine[1];
  const xc = /\/cc-(\d{4})\//.exec(href);
  if (xc) return `cc${xc[1]}`;
  return null;
}

/** Longest name first, so "YouTube & Ski…" is not split into the shorter YouTube link. */
const STREAMS = [
  {
    token: "YouTube & Ski & Snowboard World Cup",
    label: "YouTube",
    site: "YouTube",
    href: "https://www.youtube.com/@skiandsnowboardworldcup",
  },
  {
    token: "Outside TV",
    label: "Outside TV",
    site: "Outside TV",
    href: "https://watch.outsideonline.com/",
  },
  {
    token: "Peacock",
    label: "NBC Peacock",
    site: "NBC Peacock",
    href: "https://www.peacocktv.com/sports",
  },
  {
    token: "YouTube",
    label: "YouTube",
    site: "YouTube",
    href: "https://www.youtube.com/@skiandsnowboardworldcup",
  },
];

/** Split a watch line into text and the streaming sites it names. */
export function watchSegments(text) {
  const source = text || "";
  const parts = [];
  let index = 0;
  while (index < source.length) {
    let best = null;
    for (const stream of STREAMS) {
      const at = source.indexOf(stream.token, index);
      if (at === -1) continue;
      if (!best || at < best.at || (at === best.at && stream.token.length > best.stream.token.length)) {
        best = { stream, at };
      }
    }
    if (!best) {
      parts.push({ type: "text", text: source.slice(index) });
      break;
    }
    if (best.at > index) parts.push({ type: "text", text: source.slice(index, best.at) });
    parts.push({
      type: "link",
      label: best.stream.label,
      site: best.stream.site,
      href: best.stream.href,
    });
    index = best.at + best.stream.token.length;
  }
  return parts;
}

export function hasPodium(race) {
  return Array.isArray(race.results?.podium) && race.results.podium.length > 0;
}

/** When a race is expected to be over, before a podium is posted. */
export function estimatedFinish(race) {
  const times = instants(race);
  if (!times.length) return null;
  const last = times[times.length - 1].getTime();
  if (race.sport === "xc") return new Date(last + XC_RUN_MS);
  if (race.sport === "freeski") return new Date(last + FREESKI_RUN_MS);
  if (isTechnical(race) && times.length >= 2) return new Date(last + RUN_MS);
  return new Date(last + SINGLE_RUN_MS);
}

/**
 * A podium finishes the race as soon as it is in the data and the start has passed.
 * Otherwise a two-run race ends 1h15m after run 2, a single alpine run ends 2h after the start,
 * a timed cross-country race ends 1h30m after the start, and a timed freeski final ends 4h after the start.
 * A TBA race ends at midnight in the venue zone.
 */
export function isFinished(race, now) {
  const times = instants(race);
  const t = now.getTime();
  if (times.length) {
    if (t >= times[0].getTime() && hasPodium(race)) return true;
    const end = estimatedFinish(race);
    return !!end && t >= end.getTime();
  }
  const open = zonedTimeToUtc(race.date, "00:00", race.tz).getTime();
  if (hasPodium(race) && t >= open) return true;
  return t >= tbaEnd(race).getTime();
}

/** Finished races stay in the hero for 3h after the estimated end, then the next race takes over. */
export function stillCurrent(race, now) {
  const end = estimatedFinish(race);
  const until = end ? end.getTime() + HERO_HOLD_MS : tbaEnd(race).getTime();
  return now.getTime() < until;
}

/**
 * When the Live button is on screen.
 * Timed races: from 1h before the first start until the race is finished (at most 4h after the last start).
 * Cross-country or freeski with no start time: the whole venue-local race day, until a podium is posted.
 * `pulsing` is true while a run is in progress. The gap between runs does not pulse.
 */
export function liveTiming(race, now) {
  if (isFinished(race, now)) return null;
  const href = liveHref(race);
  const t = now.getTime();
  const times = instants(race);
  if (!times.length) {
    if (race.sport !== "xc" && race.sport !== "freeski") return null;
    const open = zonedTimeToUtc(race.date, "00:00", race.tz).getTime();
    const close = tbaEnd(race).getTime();
    if (t < open || t >= close) return null;
    return { href, pulsing: true };
  }
  const first = times[0].getTime();
  const last = times[times.length - 1].getTime();
  if (t < first - LIVE_LEAD_MS || t >= last + LIVE_TAIL_MS) return null;
  let pulsing = t >= first;
  if (isTechnical(race) && times.length >= 2) {
    const gap = first + RUN_MS;
    if (t >= gap && t < times[1].getTime()) pulsing = false;
  }
  return { href, pulsing };
}

export function phase(race, now) {
  if (isFinished(race, now)) return "past";
  const times = instants(race);
  if (!times.length || now.getTime() < times[0].getTime()) return "upcoming";
  return "live";
}

/** Known starts sort by the first gun. A time-TBA race sorts at the end of its local day. */
export function sortKey(race) {
  const times = instants(race);
  if (times.length) return times[0].getTime();
  return tbaEnd(race).getTime() - 1;
}

const COUNTRY = {
  AND: "Andorra", AUT: "Austria", CAN: "Canada", CHN: "China", FIN: "Finland", FRA: "France",
  GER: "Germany", ITA: "Italy", NOR: "Norway", SLO: "Slovenia", SUI: "Switzerland",
  SVK: "Slovakia", SWE: "Sweden", USA: "United States",
};

/**
 * Chip filters are booleans: { alpine, xc, freeski, men, women }.
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
  const open = races.filter((r) => matches(r, filters) && stillCurrent(r, now));
  open.sort(bySchedule);
  return open[0] || null;
}

export function upcomingRaces(races, now, filters, timeZone = viewerTimeZone()) {
  const hero = nextRace(races, now, filters);
  const today = localDate(now, timeZone);
  return races
    .filter((r) => {
      if (!matches(r, filters) || r === hero) return false;
      if (isFinished(r, now)) return raceDay(r, timeZone) === today;
      return stillCurrent(r, now);
    })
    .sort(bySchedule);
}

export function pastRaces(races, now, filters, timeZone = viewerTimeZone()) {
  const today = localDate(now, timeZone);
  return races
    .filter((r) => matches(r, filters) && isFinished(r, now) && raceDay(r, timeZone) < today)
    .sort((a, b) => bySchedule(b, a));
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

/** Hero line: countdown, between-runs, underway, or finished. */
export function statusLine(race, now, timeZone = viewerTimeZone()) {
  if (isFinished(race, now)) return "Finished";
  const times = instants(race);
  if (!times.length) return "Time TBA";
  const t = now.getTime();
  if (t < times[0].getTime()) return `Starts in ${countdown(times[0], now)}`;
  if (isTechnical(race) && times.length >= 2) {
    const gap = times[0].getTime() + RUN_MS;
    if (t >= gap && t < times[1].getTime()) {
      return `Run 1 done · Run 2 at ${formatClock(times[1], timeZone)}`;
    }
  }
  return "Underway";
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

/** One entry per start. Slalom and GS keep run 1 and run 2 together. */
export function startClocks(race, timeZone = viewerTimeZone()) {
  const times = instants(race);
  if (!times.length) return [{ label: "Time TBA", time: "", zone: "" }];
  const technical = isTechnical(race) && times.length >= 2;
  return times.map((instant, index) => ({
    label: technical ? `Run ${index + 1}` : "",
    time: formatTimeOfDay(instant, timeZone),
    zone: zoneLabel(instant, timeZone),
  }));
}

/** Plain start lines in the viewer's zone, each with a short zone label. */
export function startLines(race, timeZone = viewerTimeZone()) {
  return startClocks(race, timeZone).map((part) => {
    if (!part.time) return part.label;
    const clock = `${part.time} ${part.zone}`;
    return part.label ? `${part.label} · ${clock}` : clock;
  });
}

/** Date heading for a race in the viewer's zone. A timed start can change the calendar day. */
export function raceCalendar(race, timeZone = viewerTimeZone()) {
  const iso = raceDay(race, timeZone);
  const label = formatRaceDate(iso);
  const weekday = label.split(",")[0];
  return {
    iso,
    label,
    day: String(Number(iso.slice(8, 10))),
    dow: weekday.slice(0, 3),
  };
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

/** Saturday and Sunday still ahead of a calendar day in the viewer's zone. Sunday returns none. */
export function thisWeekend(today) {
  const dow = weekday(today);
  if (dow === 0) return [];
  if (dow === 6) return [addDays(today, 1)];
  const sat = addDays(today, 6 - dow);
  return [sat, addDays(sat, 1)];
}

/** Viewer's calendar day of the first start, or the FIS date when the start is TBA. */
export function raceDay(race, timeZone = viewerTimeZone()) {
  const times = instants(race);
  if (times.length) return localDate(times[0], timeZone);
  return race.date;
}

/**
 * Group an already-filtered upcoming list.
 * Today, then any weekdays before the weekend, then This weekend, then Monday–Sunday ranges.
 */
export function groupUpcoming(races, now, timeZone = viewerTimeZone()) {
  const today = localDate(now, timeZone);
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
    const day = raceDay(race, timeZone);
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

function eventTitle(race) {
  const who = race.gender === "men" ? "Men's" : race.gender === "women" ? "Women's" : "Mixed";
  return `${who} ${race.discipline} — ${race.venue}`;
}

function eventPlace(race) {
  return COUNTRY[race.country] ? `${race.venue}, ${COUNTRY[race.country]}` : race.venue;
}

function eventDetails(race, timeZone = viewerTimeZone()) {
  return [
    ...startLines(race, timeZone),
    race.watch,
    race.note,
    fisResultsUrl(race),
    "https://brokkssmidja.github.io/ski/",
  ].filter(Boolean).join("\n");
}

/** UTC range for a timed race, or an exclusive all-day range when the start is TBA. */
export function calendarDates(race) {
  const times = instants(race);
  if (!times.length) {
    const end = addDays(race.date, 1).replace(/-/g, "");
    return `${race.date.replace(/-/g, "")}/${end}`;
  }
  return `${icsStamp(times[0])}/${icsStamp(estimatedFinish(race))}`;
}

/**
 * Google Calendar template. Timed races use UTC stamps.
 * A giant slalom or slalom runs until 1h15m after run 2, a downhill or super-G for 2h,
 * and a timed cross-country race for 1h30m. TBA is all-day.
 */
export function googleCalendarUrl(race, timeZone = viewerTimeZone()) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(race),
    dates: calendarDates(race),
    details: eventDetails(race, timeZone),
    location: eventPlace(race),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** One VEVENT. Same span as the Google Calendar link. TBA is all-day. */
export function icsFor(race, now = new Date(), timeZone = viewerTimeZone()) {
  const times = instants(race);
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
    lines.push(`DTSTART:${icsStamp(times[0])}`);
    lines.push(`DTEND:${icsStamp(estimatedFinish(race))}`);
  }
  lines.push(
    `SUMMARY:${icsEscape(eventTitle(race))}`,
    `LOCATION:${icsEscape(eventPlace(race))}`,
    `DESCRIPTION:${icsEscape(eventDetails(race, timeZone))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return foldIcs(lines);
}
