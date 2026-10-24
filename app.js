import {
  countdown,
  countdownTarget,
  formatET,
  formatMonth,
  formatRaceDate,
  nextRace,
  pastRaces,
  phase,
  upcomingRaces,
} from "./schedule.js";

const COUNTRY = {
  AND: "Andorra", AUT: "Austria", CAN: "Canada", FIN: "Finland", FRA: "France",
  GER: "Germany", ITA: "Italy", NOR: "Norway", SLO: "Slovenia", SUI: "Switzerland",
  SVK: "Slovakia", SWE: "Sweden", USA: "United States",
};
const ISO2 = {
  AND: "AD", AUT: "AT", CAN: "CA", FIN: "FI", FRA: "FR", GER: "DE", ITA: "IT",
  NOR: "NO", SLO: "SI", SUI: "CH", SVK: "SK", SWE: "SE", USA: "US",
};
const GENDER = { women: "Women", men: "Men", mixed: "Mixed" };
const SPORT = { alpine: "Alpine", xc: "Cross-country" };
const SHORT = { "Giant Slalom": "GS", Slalom: "SL", Downhill: "DH", "Super-G": "SG" };

const sportBox = document.querySelector("#sport");
const genderBox = document.querySelector("#gender");
const heroEl = document.querySelector("#hero");
const upcomingEl = document.querySelector("#upcoming");
const pastEl = document.querySelector("#past");
const pastToggle = document.querySelector("#past-toggle");
const preview = document.querySelector("#preview");

const filters = {
  sport: stored("ski-sport", ["all", "alpine", "xc"], "all"),
  gender: stored("ski-gender", ["all", "men", "women"], "all"),
};
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

function flag(code) {
  const iso = ISO2[code];
  if (!iso) return "";
  return [...iso].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

function knownStarts(race) {
  return (race.starts || []).filter(Boolean);
}

function clockLabel(race) {
  const times = knownStarts(race);
  if (!times.length) return "Time TBA";
  if (times.length === 1) return formatET(times[0]);
  return `${formatET(times[0]).replace(" ET", "")} / ${formatET(times[1])}`;
}

function fisUrl(race) {
  const match = /^(alpine|xc)-(\d+)$/.exec(race.id);
  if (!match) return null;
  const sector = match[1] === "alpine" ? "AL" : "CC";
  return `https://www.fis-ski.com/DB/general/results.html?sectorcode=${sector}&raceid=${match[2]}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function countdownText(race, now) {
  const status = phase(race, now);
  const target = countdownTarget(race, now);
  if (status === "live" && target) return `Run 2 in ${countdown(target, now)}`;
  if (status === "live") return "Underway";
  if (target) return `Starts in ${countdown(target, now)}`;
  return "Time TBA";
}

function paintChips() {
  for (const button of sportBox.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.sport === filters.sport));
  }
  for (const button of genderBox.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.gender === filters.gender));
  }
}

function renderHero(race, now) {
  heroEl.replaceChildren();
  if (!race) {
    heroEl.append(el("p", "empty", "No upcoming races in this view."));
    return;
  }
  const status = phase(race, now);
  const card = el("article", status === "live" ? "hero live" : "hero");
  const bits = [SPORT[race.sport], GENDER[race.gender]];
  if (status === "live") bits.unshift("Live");
  card.append(el("p", "kicker", bits.join(" · ")));
  card.append(el("h2", "", race.discipline));
  card.append(el("p", "venue", `${flag(race.country)} ${race.venue}, ${COUNTRY[race.country] || race.country}`));
  card.append(el("p", "when", formatRaceDate(race.date)));
  const times = knownStarts(race);
  if (!times.length) {
    card.append(el("p", "times", "Time TBA"));
  } else if (times.length === 1) {
    card.append(el("p", "times", formatET(times[0])));
  } else {
    const line = el("p", "times");
    line.append(`Run 1 · ${formatET(times[0])}`);
    line.append(document.createElement("br"));
    line.append(`Run 2 · ${formatET(times[1])}`);
    card.append(line);
  }
  card.append(el("p", "countdown", countdownText(race, now)));
  if (race.note) {
    const tags = el("div", "tags");
    for (const note of race.note.split(" · ")) tags.append(el("span", "tag", note));
    card.append(tags);
  }
  const watch = el("p", "watch", race.watch);
  const link = fisUrl(race);
  if (link) {
    watch.append(" ");
    const a = el("a", "fis", "FIS");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener";
    watch.append(a);
  }
  card.append(watch);
  heroEl.append(card);
}

function renderUpcoming(list) {
  upcomingEl.replaceChildren();
  if (!list.length) return;
  let month = "";
  let box = null;
  for (const race of list) {
    const label = formatMonth(race.date);
    if (label !== month) {
      month = label;
      box = el("section", "month");
      box.append(el("h3", "", label));
      upcomingEl.append(box);
    }
    const row = el("article", "race");
    const day = el("div");
    const [, , d] = race.date.split("-");
    day.append(el("div", "day", String(Number(d))));
    const weekday = formatRaceDate(race.date).split(",")[0].slice(0, 3);
    day.append(el("div", "dow", weekday));
    const body = el("div");
    const what = SHORT[race.discipline] || race.discipline;
    body.append(el("div", "what", `${what} · ${GENDER[race.gender]}`));
    body.append(el("div", "meta", `${flag(race.country)} ${race.venue}${race.note ? " · " + race.note : ""}`));
    body.append(el("div", "clock", clockLabel(race)));
    row.append(day, body);
    box.append(row);
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
    const card = el("article", "past-card");
    card.append(el("h3", "", `${race.discipline} · ${GENDER[race.gender]}`));
    card.append(el("p", "", `${flag(race.country)} ${race.venue} · ${formatRaceDate(race.date)}`));
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
    pastEl.append(card);
  }
}

function viewSignature() {
  const hero = nextRace(races, clock, filters);
  return [
    filters.sport,
    filters.gender,
    showPast,
    hero?.id || "",
    hero ? phase(hero, clock) : "none",
    pastRaces(races, clock, filters).length,
  ].join("|");
}

function render() {
  paintChips();
  const hero = nextRace(races, clock, filters);
  renderHero(hero, clock);
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
  if (node && hero) node.textContent = countdownText(hero, clock);
}

function currentTime() {
  const raw = new URLSearchParams(location.search).get("asof");
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  preview.hidden = false;
  preview.textContent = `Previewing the schedule as of ${parsed.toISOString().replace(".000", "")}.`;
  return parsed;
}

sportBox.addEventListener("click", (event) => {
  const sport = event.target?.dataset?.sport;
  if (!sport) return;
  filters.sport = sport;
  save("ski-sport", sport);
  render();
});
genderBox.addEventListener("click", (event) => {
  const gender = event.target?.dataset?.gender;
  if (!gender) return;
  filters.gender = gender;
  save("ski-gender", gender);
  render();
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
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
