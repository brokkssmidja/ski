import { contendersByCountry } from "./contenders.js";
import {
  fisResultsUrl,
  formatClock,
  googleCalendarUrl,
  groupUpcoming,
  icsFilename,
  icsFor,
  isFinished,
  liveTiming,
  localDate,
  matches,
  nextRace,
  pastRaces,
  phase,
  raceCalendar,
  startClocks,
  statusLine,
  upcomingRaces,
  viewerTimeZone,
  watchSegments,
  zoneHeading,
} from "./schedule.js";

const COUNTRY = {
  ALB: "Albania", AND: "Andorra", AUT: "Austria", CAN: "Canada", FIN: "Finland", FRA: "France",
  GER: "Germany", ITA: "Italy", NOR: "Norway", SLO: "Slovenia", SUI: "Switzerland",
  SVK: "Slovakia", SWE: "Sweden", USA: "United States",
};
const ISO2 = {
  ALB: "AL", AND: "AD", AUT: "AT", CAN: "CA", FIN: "FI", FRA: "FR", GER: "DE", ITA: "IT",
  NOR: "NO", SLO: "SI", SUI: "CH", SVK: "SK", SWE: "SE", USA: "US",
};
const GENDER = { women: "Women", men: "Men", mixed: "Mixed" };
const SPORT = { alpine: "Alpine", xc: "Cross-country" };
const SHORT = { "Giant Slalom": "GS", Slalom: "SL", Downhill: "DH", "Super-G": "SG" };

const sportBox = document.querySelector("#sport");
const genderBox = document.querySelector("#gender");
const heroEl = document.querySelector("#hero");
const liveStrip = document.querySelector("#live-strip");
const upcomingEl = document.querySelector("#upcoming");
const pastEl = document.querySelector("#past");
const pastToggle = document.querySelector("#past-toggle");
const preview = document.querySelector("#preview");

let filters = loadFilters();
let showPast = stored("ski-past", ["0", "1"], "0") === "1";
let races = [];
let clock = new Date();
let signature = "";

function stored(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function loadFilters() {
  const fallback = { alpine: true, xc: true, men: true, women: true };
  try {
    const raw = localStorage.getItem("ski-filters");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          alpine: parsed.alpine !== false,
          xc: parsed.xc !== false,
          men: parsed.men !== false,
          women: parsed.women !== false,
        };
      }
    }
    const sport = localStorage.getItem("ski-sport");
    const gender = localStorage.getItem("ski-gender");
    if (sport || gender) {
      return {
        alpine: sport !== "xc",
        xc: sport !== "alpine",
        men: gender !== "women",
        women: gender !== "men",
      };
    }
  } catch {
    /* private mode or unreadable JSON */
  }
  return fallback;
}

function flag(code) {
  const iso = ISO2[code];
  if (!iso) return "";
  return [...iso].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

function fisUrl(race) {
  return fisResultsUrl(race);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function statusNode(race, now) {
  const text = statusLine(race, now);
  return el("p", text.length > 18 ? "countdown long" : "countdown", text);
}

function paintChips() {
  for (const button of sportBox.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(!!filters[button.dataset.filter]));
  }
  for (const button of genderBox.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(!!filters[button.dataset.filter]));
  }
}

function zoneSpan(name) {
  const zone = el("span", "zone", name);
  zone.title = viewerTimeZone();
  return zone;
}

function appendClocks(node, race, separator) {
  const clocks = startClocks(race);
  clocks.forEach((part, index) => {
    if (index) node.append(el("span", "sep", separator));
    const run = el("span", "run");
    if (!part.time) {
      run.textContent = part.label;
    } else {
      if (part.label) run.append(`${part.label} · `);
      run.append(`${part.time} `);
      run.append(zoneSpan(part.zone));
    }
    node.append(run);
  });
  return clocks;
}

function timesNode(race, tag) {
  const node = el(tag, "times");
  const clocks = appendClocks(node, race, " · ");
  if (clocks.length > 1) node.classList.add("runs");
  return node;
}

function contenderNode(race) {
  const rows = contendersByCountry(race);
  if (!rows.length) return null;
  const wrap = el("div", "contenders");
  for (const row of rows) {
    const pair = el("span", "pair");
    const badge = el("span", `badge ${row.code.toLowerCase()}`, row.code);
    badge.title = COUNTRY[row.country] || row.code;
    pair.append(badge, el("span", "names", row.names.join(", ")));
    wrap.append(pair);
  }
  return wrap;
}

function externalIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ext-icon");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("fill", "currentColor");
  arrow.setAttribute("d", "M6.2 8.2a.75.75 0 0 0 1.1 1.1l5.2-5.2v1.7a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.7L6.2 8.2z");
  const box = document.createElementNS("http://www.w3.org/2000/svg", "path");
  box.setAttribute("fill", "currentColor");
  box.setAttribute("d", "M3.5 6.8c0-.7.6-1.3 1.3-1.3H7a.75.75 0 0 0 0-1.5H4.8A2.75 2.75 0 0 0 2 6.8v4.5A2.75 2.75 0 0 0 4.8 14h4.5A2.75 2.75 0 0 0 12 11.3V9a.75.75 0 0 0-1.5 0v2.3c0 .7-.6 1.2-1.2 1.2H4.8c-.7 0-1.3-.5-1.3-1.2V6.8z");
  svg.append(arrow, box);
  return svg;
}

function leaveApp(anchor, ariaLabel) {
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.setAttribute("aria-label", ariaLabel);
}

function calendarActions(race) {
  const wrap = el("div", "cals");
  const google = el("a", "gcal");
  const label = el("span", "ext-label", "Add to Google Calendar");
  google.append(label, externalIcon());
  google.href = googleCalendarUrl(race);
  leaveApp(
    google,
    `Add ${race.discipline} in ${race.venue} to Google Calendar. Opens Google Calendar in a new tab.`,
  );
  const ics = el("button", "ics", "Download .ics");
  ics.type = "button";
  ics.dataset.ics = race.id;
  ics.setAttribute("aria-label", `Download an .ics file for ${race.discipline} in ${race.venue}`);
  wrap.append(google, ics);
  return wrap;
}

function podiumNode(race) {
  const rows = [...(race.results?.podium || [])].sort((a, b) => a.place - b.place);
  if (!rows.length) return null;
  const list = el("ol", "podium");
  for (const row of rows) {
    const li = el("li");
    li.append(el("b", "", String(row.place)));
    li.append(el("span", "", row.name));
    li.append(el("span", "", `${flag(row.country)} ${row.country}`));
    list.append(li);
  }
  return list;
}

function fisAction(className, href, action, ariaLabel) {
  const anchor = el("a", className);
  anchor.href = href;
  leaveApp(anchor, ariaLabel);
  const label = el("span", "ext-label");
  label.append(action);
  label.append(el("span", "ext-where", " (FIS website)"));
  anchor.append(label, externalIcon());
  return anchor;
}

function raceWhere(race) {
  return `${GENDER[race.gender]} ${race.discipline} in ${race.venue}`;
}

function resultsLink(race) {
  const href = fisUrl(race);
  if (!href) return null;
  return fisAction(
    "results-link",
    href,
    "Results",
    `Results for ${raceWhere(race)}. Opens the FIS website in a new tab.`,
  );
}

function liveLink(race, now) {
  const timing = liveTiming(race, now);
  if (!timing) return null;
  const anchor = fisAction(
    timing.pulsing ? "live-link on" : "live-link",
    timing.href,
    "Live",
    timing.pulsing
      ? `Live now, ${raceWhere(race)}. Opens the FIS website in a new tab.`
      : `Live timing for ${raceWhere(race)}. Opens the FIS website in a new tab.`,
  );
  if (timing.pulsing) {
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    anchor.prepend(dot);
  }
  return anchor;
}

function streamLink(part) {
  const anchor = el("a", "ext stream");
  anchor.href = part.href;
  leaveApp(anchor, `Opens ${part.site} in a new tab.`);
  anchor.append("(");
  anchor.append(el("span", "ext-name", part.label));
  anchor.append(externalIcon());
  anchor.append(")");
  return anchor;
}

function fisTextLink(href) {
  const anchor = el("a", "ext fis");
  anchor.href = href;
  leaveApp(anchor, "Opens the FIS website in a new tab.");
  const label = el("span", "ext-label");
  label.append(el("span", "ext-where", "(FIS website)"));
  anchor.append(label, externalIcon());
  return anchor;
}

function watchNode(race) {
  const watch = el("p", "watch");
  for (const part of watchSegments(race.watch)) {
    watch.append(part.type === "link" ? streamLink(part) : part.text);
  }
  const link = fisUrl(race);
  if (link) {
    if (race.watch) watch.append(" ");
    watch.append(fisTextLink(link));
  }
  return watch;
}

function downloadIcs(race) {
  const blob = new Blob([icsFor(race, clock)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFilename(race);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function renderHero(race, now) {
  heroEl.replaceChildren();
  if (!race) {
    heroEl.append(el("p", "empty", "No upcoming races in this view."));
    return;
  }
  const status = phase(race, now);
  const finished = isFinished(race, now);
  const classes = ["hero"];
  if (status === "live") classes.push("live");
  if (contendersByCountry(race).length) classes.push("featured");
  const card = el("article", classes.join(" "));
  const bits = [SPORT[race.sport], GENDER[race.gender]];
  if (status === "live") bits.unshift("Live");
  card.append(el("p", "kicker", bits.join(" · ")));
  card.append(el("h2", "", race.discipline));
  card.append(el("p", "venue", `${flag(race.country)} ${race.venue}, ${COUNTRY[race.country] || race.country}`));
  card.append(el("p", "when", raceCalendar(race).label));
  card.append(timesNode(race, "p"));
  const watching = contenderNode(race);
  if (watching) card.append(watching);
  card.append(statusNode(race, now));
  const podium = finished ? podiumNode(race) : null;
  if (podium) card.append(podium);
  const action = finished ? resultsLink(race) : liveLink(race, now);
  if (action) card.append(action);
  if (race.note) {
    const tags = el("div", "tags");
    for (const note of race.note.split(" · ")) tags.append(el("span", "tag", note));
    card.append(tags);
  }
  card.append(watchNode(race));
  card.append(calendarActions(race));
  heroEl.append(card);
}

function raceRow(race, now) {
  const featured = contendersByCountry(race).length ? " featured" : "";
  const row = el("article", `race${featured}`);
  const day = el("div");
  const calendar = raceCalendar(race);
  day.append(el("div", "day", calendar.day));
  day.append(el("div", "dow", calendar.dow));
  const body = el("div");
  const what = SHORT[race.discipline] || race.discipline;
  body.append(el("div", "what", `${what} · ${GENDER[race.gender]}`));
  body.append(el("div", "meta", `${flag(race.country)} ${race.venue}${race.note ? " · " + race.note : ""}`));
  const clockLine = el("div", "clock");
  appendClocks(clockLine, race, " · ");
  body.append(clockLine);
  const watching = contenderNode(race);
  if (watching) body.append(watching);
  if (isFinished(race, now)) {
    body.append(el("div", "finished", "Finished"));
    const podium = podiumNode(race);
    if (podium) body.append(podium);
    const results = resultsLink(race);
    if (results) body.append(results);
  } else {
    const live = liveLink(race, now);
    if (live) body.append(live);
  }
  body.append(calendarActions(race));
  row.append(day, body);
  return row;
}

function renderLiveStrip(hero, now) {
  liveStrip.replaceChildren();
  for (const race of races) {
    if (!matches(race, filters) || race === hero) continue;
    if (phase(race, now) !== "past" || !liveTiming(race, now)) continue;
    const card = el("article", "live-card");
    const who = `${GENDER[race.gender]} ${race.discipline}`;
    card.append(el("p", "", `${who} · ${race.venue}`));
    card.append(liveLink(race, now));
    liveStrip.append(card);
  }
}

function renderUpcoming(list) {
  upcomingEl.replaceChildren();
  for (const group of groupUpcoming(list, clock)) {
    const box = el("section", "group");
    box.append(el("h3", "", group.title));
    for (const race of group.races) box.append(raceRow(race, clock));
    upcomingEl.append(box);
  }
}

function renderPast(list) {
  pastEl.replaceChildren();
  pastToggle.textContent = showPast ? "Hide past results" : `Past results${list.length ? ` (${list.length})` : ""}`;
  pastToggle.setAttribute("aria-expanded", String(showPast));
  pastEl.hidden = !showPast;
  if (!showPast) return;
  if (!list.length) {
    pastEl.append(el("p", "empty", "Nothing has been run in this view yet."));
    return;
  }
  for (const race of list) {
    const featured = contendersByCountry(race).length ? " featured" : "";
    const card = el("article", `past-card${featured}`);
    card.append(el("h3", "", `${race.discipline} · ${GENDER[race.gender]}`));
    card.append(el("p", "", `${flag(race.country)} ${race.venue} · ${raceCalendar(race).label}`));
    const watching = contenderNode(race);
    if (watching) card.append(watching);
    const podium = race.results?.podium || [];
    if (!podium.length) {
      card.append(el("p", "", "Podium not posted yet"));
    } else {
      const ol = el("ol", "podium");
      for (const row of podium) {
        const li = el("li");
        li.append(el("b", "", String(row.place)));
        li.append(el("span", "", row.name));
        li.append(el("span", "", `${flag(row.country)} ${row.country}`));
        ol.append(li);
      }
      card.append(ol);
    }
    const results = resultsLink(race);
    if (results) card.append(results);
    card.append(calendarActions(race));
    pastEl.append(card);
  }
}

function viewSignature() {
  const hero = nextRace(races, clock, filters);
  return [
    JSON.stringify(filters),
    showPast,
    hero?.id || "",
    hero ? phase(hero, clock) : "none",
    pastRaces(races, clock, filters).length,
    zoneHeading(clock),
    localDate(clock),
    races.map((race) => {
      const timing = liveTiming(race, clock);
      const mark = isFinished(race, clock) ? "f" : "";
      if (!timing) return mark && `${race.id}${mark}`;
      return `${race.id}${mark}${timing.pulsing ? "*" : ""}`;
    }).filter(Boolean).join(","),
  ].join("|");
}

function paintZone() {
  const label = zoneHeading(clock);
  for (const node of document.querySelectorAll(".tz-name")) node.textContent = label;
}

function render() {
  paintZone();
  paintChips();
  const hero = nextRace(races, clock, filters);
  renderHero(hero, clock);
  renderLiveStrip(hero, clock);
  renderUpcoming(upcomingRaces(races, clock, filters));
  renderPast(pastRaces(races, clock, filters));
  signature = viewSignature();
}

function tick() {
  const hero = nextRace(races, clock, filters);
  if (viewSignature() !== signature) {
    render();
    return;
  }
  const node = heroEl.querySelector(".countdown");
  if (node && hero) {
    const text = statusLine(hero, clock);
    node.textContent = text;
    node.className = text.length > 18 ? "countdown long" : "countdown";
  }
}

function toggleFilter(key) {
  if (!Object.hasOwn(filters, key)) return;
  filters = { ...filters, [key]: !filters[key] };
  save("ski-filters", JSON.stringify(filters));
  render();
}

function currentTime() {
  const raw = new URLSearchParams(location.search).get("asof");
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  preview.hidden = false;
  const stamp = parsed.toISOString().replace(".000", "");
  preview.textContent = `Previewing the schedule as of ${stamp} (${formatClock(parsed)}).`;
  return parsed;
}

document.querySelector("main").addEventListener("click", (event) => {
  const filter = event.target.closest?.("[data-filter]");
  if (filter && (sportBox.contains(filter) || genderBox.contains(filter))) {
    toggleFilter(filter.dataset.filter);
    return;
  }
  const button = event.target.closest?.("[data-ics]");
  if (!button) return;
  const race = races.find((item) => item.id === button.dataset.ics);
  if (race) downloadIcs(race);
});

pastToggle.addEventListener("click", () => {
  showPast = !showPast;
  save("ski-past", showPast ? "1" : "0");
  render();
});

const response = await fetch("./races.json", { cache: "no-cache" });
const payload = await response.json();
races = payload.races;
clock = currentTime();
render();
setInterval(() => {
  if (!new URLSearchParams(location.search).get("asof")) clock = new Date();
  tick();
}, 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
