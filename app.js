import { contendersByCountry } from "./contenders.js";
import { IOS_DISMISS_KEY, IOS_INSTALL_COPY, iosHintVisible, iosSafari, standaloneDisplay } from "./install.js";
import {
  athleteDiff,
  cardStatus,
  countsLine,
  delayFromTap,
  emptyStartLog,
  formatTvDelay,
  holdMessage,
  livePayloadOk,
  nationFlag,
  nextStarters,
  nudgeDelay,
  observeStarts,
  onCourse,
  parseTvDelay,
  pollDelay,
  pruneSnapshots,
  pushSnapshot,
  recentStarters,
  relayUrl,
  runLabel,
  serializeTvDelay,
  skierId,
  snapshotAt,
  startFor,
  statusLabel,
  syncReady,
  timesNote,
  topResults,
  TV_DELAY_KEY,
  TV_DELAY_MAX_MS,
  TV_NUDGE_MS,
  updatedAgo,
} from "./live.js";
import {
  fisResultsUrl,
  formatClock,
  googleCalendarUrl,
  groupUpcoming,
  icsFilename,
  icsFor,
  isFinished,
  liveCodex,
  liveHref,
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
import {
  initials,
  markText,
  photoUrl,
  podiumFromRelay,
  podiumFromStored,
  presentPodium,
  standingsChoices,
  standingRows,
} from "./results.js";
import {
  ageLabel,
  badgeText,
  displayState,
  findRace,
  ccLivePayload,
  ccTimingUrl,
  parseTimingXml,
  raceModel,
  raceSlug,
  timingXmlUrl,
} from "./racemodel.js";
import { renderRacePage } from "./racepage.js";

const COUNTRY = {
  ALB: "Albania", AND: "Andorra", AUT: "Austria", CAN: "Canada", CHN: "China", FIN: "Finland", FRA: "France",
  GER: "Germany", ITA: "Italy", NOR: "Norway", SLO: "Slovenia", SUI: "Switzerland",
  SVK: "Slovakia", SWE: "Sweden", USA: "United States",
};
const ISO2 = {
  ALB: "AL", AND: "AD", AUT: "AT", CAN: "CA", CHN: "CN", FIN: "FI", FRA: "FR", GER: "DE", ITA: "IT",
  NOR: "NO", SLO: "SI", SUI: "CH", SVK: "SK", SWE: "SE", USA: "US",
};
const GENDER = { women: "Women", men: "Men", mixed: "Mixed" };
const SPORT = { alpine: "Alpine", xc: "Cross-country", freeski: "Freeski" };
const SHORT = {
  "Giant Slalom": "GS", Slalom: "SL", Downhill: "DH", "Super-G": "SG",
  Halfpipe: "HP", "Halfpipe Qualification": "HP Q",
  Slopestyle: "SS", "Slopestyle Qualification": "SS Q",
  "Big Air": "BA", "Big Air Qualification": "BA Q",
};

const sportBox = document.querySelector("#sport");
const genderBox = document.querySelector("#gender");
const heroEl = document.querySelector("#hero");
const liveStrip = document.querySelector("#live-strip");
const raceEl = document.querySelector("#race");
const RACE_CACHE = "ski-race-cache";
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
  const fallback = { alpine: true, xc: true, freeski: true, men: true, women: true };
  try {
    const raw = localStorage.getItem("ski-filters");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          alpine: parsed.alpine !== false,
          xc: parsed.xc !== false,
          freeski: parsed.freeski !== false,
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
        freeski: true,
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

function headingText(race, now) {
  const session = liveSessions.get(race.id);
  const payload = session && !session.holding ? session.view : null;
  return cardStatus(statusLine(race, now), payload);
}

function paintHeading(race, now = clock) {
  if (!race) return;
  const hero = nextRace(races, now, filters);
  if (!hero || hero.id !== race.id) return;
  const node = heroEl.querySelector(".countdown");
  if (!node) return;
  const text = headingText(hero, now);
  node.textContent = text;
  node.className = text.length > 18 ? "countdown long" : "countdown";
}

function statusNode(race, now) {
  const text = headingText(race, now);
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

function nationText(person) {
  if (!person || typeof person !== "object") return typeof person === "string" ? person : "";
  const code = person.nation || person.country || "";
  return [nationFlag(code), code, person.name].filter(Boolean).join(" ");
}

function athleteLine(person, timeText, field, sync) {
  const row = el("div", "ath");
  const mark = person && typeof person === "object" && person[field] != null ? String(person[field]) : "";
  row.append(el("b", "", mark));
  row.append(el("span", "who", nationText(person) || "—"));
  if (!sync) {
    row.append(el("span", "time", timeText || ""));
    return row;
  }
  row.classList.add("has-sync");
  const side = el("span", "side");
  if (timeText) side.append(el("span", "time", timeText));
  side.append(sync);
  row.append(side);
  return row;
}

function lastStamp(person, leader) {
  const diff = athleteDiff(person, leader);
  const time = person?.time || "";
  if (time && diff && diff !== time) return `${time}  ${diff}`;
  return diff || time;
}

function liveBlock(title, body) {
  const wrap = el("div", "live-block");
  wrap.append(el("p", "role", title));
  wrap.append(body);
  return wrap;
}

function syncButton(person, ready, partial, onSync) {
  const button = el("button", "sync", "Sync");
  button.type = "button";
  const who = [person?.bib, person?.name].filter((part) => part != null && part !== "").join(" ");
  button.setAttribute("aria-label", who ? `Sync TV to ${who}` : "Sync TV");
  if (!ready) {
    button.disabled = true;
    button.title = "Waiting until the live timing shows this start.";
  } else if (partial) {
    button.title = "Already on course when this page opened. The delay may be short.";
  } else {
    button.title = "Tap when this skier leaves the start on TV.";
  }
  button.addEventListener("click", () => { if (ready) onSync(person); });
  return button;
}

function tvControls(session, onNudge, onLive) {
  const box = el("div", "tv");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Broadcast sync");
  const delay = el("p", "tv-delay", `TV delay ${formatTvDelay(session.delayMs)}`);
  box.append(delay);
  const actions = el("div", "tv-actions");
  const minus = el("button", "", "-5s");
  minus.type = "button";
  minus.setAttribute("aria-label", "Subtract 5 seconds from the TV delay");
  minus.disabled = session.delayMs <= 0;
  minus.addEventListener("click", () => onNudge(-TV_NUDGE_MS));
  const plus = el("button", "", "+5s");
  plus.type = "button";
  plus.setAttribute("aria-label", "Add 5 seconds to the TV delay");
  plus.disabled = session.delayMs >= TV_DELAY_MAX_MS;
  plus.addEventListener("click", () => onNudge(TV_NUDGE_MS));
  const live = el("button", "", "Live");
  live.type = "button";
  live.setAttribute("aria-label", "Clear the TV delay and show live timing");
  live.disabled = session.delayMs <= 0;
  live.addEventListener("click", onLive);
  actions.append(minus, plus, live);
  box.append(actions);
  box.append(el("p", "tv-hint", "Tap Sync when that skier leaves the start on TV."));
  if (session.syncNote) box.append(el("p", "tv-note", session.syncNote));
  return box;
}

function livePanelNode(session, now, actions) {
  const payload = session.view;
  const panel = el("section", "live-panel");
  panel.setAttribute("aria-label", "Live timing");
  if (payload?.status === "live") panel.classList.add("racing");

  if (session.holding || !payload) {
    panel.append(tvControls(session, actions.onNudge, actions.onLive));
    const wait = el("p", "tv-wait", holdMessage(session.waitMs));
    if (session.holdUntil) wait.dataset.until = String(session.holdUntil);
    panel.append(wait);
    return panel;
  }

  const status = el("p", "live-status");
  if (payload.status === "live") {
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot);
  }
  status.append([statusLabel(payload.status), runLabel(payload)].filter(Boolean).join(" · "));
  panel.append(status);
  if (payload.message) panel.append(el("p", "live-message", payload.message));
  panel.append(tvControls(session, actions.onNudge, actions.onLive));

  const run = Number(payload.run) || 0;
  const buttonFor = (person) => {
    const starter = syncReady(session.starts, run, person, session.viewAt);
    return syncButton(person, !!starter, !!starter?.partial, actions.onSync);
  };

  const started = recentStarters(session.starts, {
    run,
    asOf: session.viewAt,
    limit: 4,
    exclude: [...onCourse(payload), ...nextStarters(payload, 3)].map(skierId),
  });
  if (started.length) {
    const startedBody = el("div", "stack");
    for (const person of started) {
      const starter = startFor(session.starts, run, person);
      startedBody.append(athleteLine(person, "", "bib", syncButton(person, true, !!starter?.partial, actions.onSync)));
    }
    panel.append(liveBlock("Started", startedBody));
  }

  const leader = payload.currentLeader;
  const leaderBody = leader
    ? athleteLine(leader, leader.time || "", "rank")
    : el("p", "quiet", "No leader yet");
  if (leader) leaderBody.classList.add("lead");
  panel.append(liveBlock("Leader", leaderBody));

  const last = payload.lastFinisher;
  panel.append(liveBlock("Last finisher", last
    ? athleteLine(last, lastStamp(last, leader), "rank")
    : el("p", "quiet", "—")));

  const course = onCourse(payload);
  const courseBody = el("div", "stack");
  if (!course.length) courseBody.append(el("p", "quiet", "Clear"));
  else {
    for (const person of course) {
      const stamp = typeof person === "object" ? (person.time || "") : "";
      courseBody.append(athleteLine(person, stamp, "bib", buttonFor(person)));
    }
  }
  panel.append(liveBlock("On course", courseBody));

  const starters = nextStarters(payload, 3);
  const nextBody = el("div", "stack");
  if (!starters.length) nextBody.append(el("p", "quiet", "—"));
  else {
    for (const person of starters) nextBody.append(athleteLine(person, "", "bib", buttonFor(person)));
  }
  panel.append(liveBlock("Next", nextBody));

  const results = topResults(payload, 10);
  if (results.length) {
    const wrap = el("div", "live-top");
    wrap.append(el("p", "role", results.length > 3 ? "Top 10" : `Top ${results.length}`));
    const list = el("div", "board");
    const shown = session.expanded ? results : results.slice(0, 3);
    for (const row of shown) {
      const diff = row.rank === 1 ? "" : athleteDiff(row, leader);
      const stamp = [row.time, diff].filter(Boolean).join("  ");
      list.append(athleteLine(row, stamp || (row.status && row.status !== "finish" ? row.status : ""), "rank"));
    }
    wrap.append(list);
    if (results.length > 3) {
      const button = el("button", "more", session.expanded ? "Show less" : `Show all ${results.length}`);
      button.type = "button";
      button.setAttribute("aria-expanded", String(!!session.expanded));
      button.addEventListener("click", actions.onToggle);
      wrap.append(button);
    }
    panel.append(wrap);
  }

  const note = timesNote(payload);
  if (note) panel.append(el("p", "live-note", note));

  const meta = el("p", "live-meta");
  const counts = countsLine(payload);
  if (counts) meta.append(counts);
  const ago = updatedAgo(payload.fetchedAt, now);
  if (ago) {
    if (counts) meta.append(el("span", "sep", " · "));
    const stamp = el("span", "ago", ago);
    if (payload.fetchedAt) stamp.dataset.fetched = payload.fetchedAt;
    meta.append(stamp);
  }
  if (meta.childNodes.length) panel.append(meta);
  return panel;
}

const liveSessions = new Map();

function liveSlot(race) {
  const slot = el("div", "live-slot");
  slot.dataset.live = race.id;
  slot.hidden = true;
  return slot;
}

function paintLiveSlot(slot, session) {
  if (!session?.view && !session?.holding) {
    slot.hidden = true;
    slot.replaceChildren();
    return;
  }
  slot.hidden = false;
  const id = slot.dataset.live;
  slot.replaceChildren(livePanelNode(session, new Date(), {
    onToggle: () => {
      session.expanded = !session.expanded;
      paintLiveSlots(id);
    },
    onNudge: (delta) => adjustDelay(id, nudgeDelay(session.delayMs, delta)),
    onLive: () => adjustDelay(id, 0),
    onSync: (person) => syncSkier(id, person),
  }));
}

function paintLiveSlots(id) {
  const session = liveSessions.get(id);
  if (!session) return;
  for (const slot of document.querySelectorAll(`[data-live="${CSS.escape(id)}"]`)) {
    paintLiveSlot(slot, session);
  }
}

function delayFor(session, race) {
  const timing = liveTiming(race, clock);
  if (!timing) return null;
  return pollDelay(session.status, {
    hidden: document.hidden,
    pulsing: timing.pulsing,
    error: session.error,
  });
}

function stopLive(id) {
  const session = liveSessions.get(id);
  if (!session) return;
  clearTimeout(session.timer);
  session.abort?.abort();
  liveSessions.delete(id);
}

function armLive(race) {
  const session = liveSessions.get(race.id);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = null;
  const delay = delayFor(session, race);
  if (delay == null) return;
  session.timer = setTimeout(() => { void pollLive(race); }, delay);
}

async function pollLive(race) {
  const session = liveSessions.get(race.id);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = null;
  session.abort?.abort();
  const abort = new AbortController();
  session.abort = abort;
  try {
    const response = await fetch(relayUrl(session.codex), { cache: "no-store", signal: abort.signal });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (abort.signal.aborted || liveSessions.get(race.id) !== session) return;
    if (!response.ok || !livePayloadOk(data, session.codex)) {
      session.error = (data && typeof data.status === "string" && data.status) || "http";
      if (!session.buffer.length) {
        session.payload = null;
        session.view = null;
        session.holding = false;
      }
    } else {
      const at = Date.now();
      session.error = null;
      session.status = data.status;
      session.payload = data;
      session.starts = observeStarts(session.starts, data, at);
      session.buffer = pruneSnapshots(pushSnapshot(session.buffer, data, at), at);
      publishView(session, at);
    }
    paintLiveSlots(race.id);
    paintHeading(race);
    armLive(race);
  } catch (err) {
    if (err?.name === "AbortError" || abort.signal.aborted) return;
    if (liveSessions.get(race.id) !== session) return;
    session.error = "http";
    if (!session.buffer.length) {
      session.payload = null;
      session.view = null;
      session.holding = false;
    }
    paintLiveSlots(race.id);
    paintHeading(race);
    armLive(race);
  } finally {
    if (session.abort === abort) session.abort = null;
  }
}

function ensureLive() {
  const seen = new Set();
  for (const slot of document.querySelectorAll("[data-live]")) {
    const race = races.find((item) => item.id === slot.dataset.live);
    const codex = race && liveCodex(race);
    if (!race || !codex || !liveTiming(race, clock)) {
      slot.hidden = true;
      slot.replaceChildren();
      continue;
    }
    seen.add(race.id);
    let session = liveSessions.get(race.id);
    if (!session || session.codex !== codex) {
      if (session) stopLive(race.id);
      session = {
        codex,
        timer: null,
        abort: null,
        payload: null,
        view: null,
        viewAt: null,
        holding: false,
        waitMs: 0,
        holdUntil: null,
        status: null,
        error: null,
        expanded: false,
        delayMs: readStoredDelay(codex),
        syncNote: "",
        starts: emptyStartLog(),
        buffer: [],
        openedAt: Date.now(),
      };
      publishView(session, session.openedAt);
      liveSessions.set(race.id, session);
      paintLiveSlot(slot, session);
      void pollLive(race);
    } else {
      publishView(session, Date.now());
      paintLiveSlot(slot, session);
      if (!session.timer && !session.abort && session.status !== "finished") void pollLive(race);
    }
  }
  for (const id of [...liveSessions.keys()]) {
    if (seen.has(id)) continue;
    const session = liveSessions.get(id);
    const race = races.find((item) => item.id === id);
    const open = findRace(location.hash, races)?.id === id;
    const onCard = race && !isFinished(race, clock) && liveTiming(race, clock);
    if (session?.raceId && (open || onCard)) continue;
    stopLive(id);
  }
}

function readStoredDelay(codex) {
  try {
    return parseTvDelay(localStorage.getItem(TV_DELAY_KEY), codex, Date.now());
  } catch {
    return 0;
  }
}

function writeStoredDelay(codex, delayMs) {
  try {
    localStorage.setItem(TV_DELAY_KEY, serializeTvDelay(codex, delayMs, Date.now()));
  } catch {
    /* private mode */
  }
}

function publishView(session, now = Date.now()) {
  const picked = snapshotAt(session.buffer, now, session.delayMs, session.openedAt || now);
  session.holding = !picked.ready;
  session.view = picked.ready ? picked.payload : null;
  session.viewAt = picked.ready ? picked.at : null;
  session.holdUntil = picked.holdUntil || null;
  session.waitMs = picked.ready ? 0 : Math.max(0, (picked.holdUntil || now) - now);
}

function adjustDelay(id, delayMs) {
  const session = liveSessions.get(id);
  if (!session) return;
  session.delayMs = delayMs;
  session.syncNote = "";
  writeStoredDelay(session.codex, delayMs);
  publishRace(session, Date.now());
  paintLiveSlots(id);
  const race = races.find((item) => item.id === id);
  if (race) {
    paintHeading(race);
    paintRace(race);
    paintBadge(race);
  }
}

function syncSkier(id, person) {
  const session = liveSessions.get(id);
  if (!session?.view || session.viewAt == null) return;
  const run = Number(session.view.run) || 0;
  const starter = startFor(session.starts, run, person);
  if (!starter || starter.at == null || starter.at > session.viewAt) return;
  const delay = delayFromTap(Date.now(), starter.at);
  if (delay == null) return;
  session.delayMs = delay;
  session.syncNote = starter.partial
    ? "This skier was already on course when the page opened, so this delay may be short. Tap the next start to correct it."
    : "";
  writeStoredDelay(session.codex, delay);
  publishRace(session, Date.now());
  paintLiveSlots(id);
  const race = races.find((item) => item.id === id);
  if (race) {
    paintHeading(race);
    paintRace(race);
    paintBadge(race);
  }
}

function refreshLiveViews() {
  const now = Date.now();
  for (const [id, session] of liveSessions) {
    if (!session.buffer.length && !session.holding) continue;
    const prevAt = session.viewAt;
    const prevHold = session.holding;
    publishView(session, now);
    if (session.viewAt !== prevAt || session.holding !== prevHold) {
      paintLiveSlots(id);
      const race = races.find((item) => item.id === id);
      if (race) paintHeading(race);
    }
  }
}

function refreshAgo() {
  const now = new Date();
  for (const node of document.querySelectorAll(".ago[data-fetched]")) {
    const text = updatedAgo(node.dataset.fetched, now);
    if (text) node.textContent = text;
  }
  const ms = now.getTime();
  for (const node of document.querySelectorAll(".tv-wait[data-until]")) {
    const until = Number(node.dataset.until);
    if (!Number.isFinite(until)) continue;
    node.textContent = holdMessage(Math.max(0, until - ms));
  }
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

const PODIUM_KEY = "ski-podium";
const PODIUM_TTL_MS = 12 * 60 * 60 * 1000;
const finishViews = new Map();
const cupPick = new Map();
let cupsBook;
let cupsPromise = null;
const podiumPromises = new Map();

function readPodiumCache(codex) {
  try {
    const all = JSON.parse(localStorage.getItem(PODIUM_KEY) || "{}");
    const hit = all[codex];
    if (!hit || !Array.isArray(hit.rows)) return null;
    if (Date.now() - Number(hit.at) > PODIUM_TTL_MS) return null;
    return hit.rows;
  } catch {
    return null;
  }
}

function writePodiumCache(codex, rows) {
  try {
    const all = JSON.parse(localStorage.getItem(PODIUM_KEY) || "{}");
    all[codex] = { at: Date.now(), rows };
    localStorage.setItem(PODIUM_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

function loadCups() {
  if (cupsBook !== undefined) return Promise.resolve(cupsBook);
  if (!cupsPromise) {
    cupsPromise = fetch("./cups.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((data) => {
        cupsBook = data;
        return data;
      });
  }
  return cupsPromise;
}

function loadRelayPodium(race) {
  const codex = liveCodex(race);
  if (!codex) return Promise.resolve([]);
  if (podiumPromises.has(codex)) return podiumPromises.get(codex);
  const job = (async () => {
    const saved = readPodiumCache(codex);
    if (saved) return saved;
    try {
      const response = await fetch(relayUrl(codex), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !livePayloadOk(data, codex)) return [];
      const rows = podiumFromRelay(data);
      if (rows.length) writePodiumCache(codex, rows);
      return rows;
    } catch {
      return [];
    }
  })();
  podiumPromises.set(codex, job);
  return job;
}

function finishSlot(race) {
  const slot = el("div", "finish");
  slot.dataset.finish = race.id;
  return slot;
}

function avatarNode(name, id) {
  const box = el("span", "avatar");
  box.setAttribute("aria-hidden", "true");
  box.append(el("span", "letters", initials(name)));
  const src = photoUrl(id);
  if (!src) return box;
  const img = document.createElement("img");
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = src;
  img.addEventListener("error", () => img.remove());
  box.append(img);
  return box;
}

function resultRow(row, mark) {
  const li = el("li", Number(row.place) === 1 ? "win" : "");
  li.append(el("b", "place", String(row.place)));
  li.append(avatarNode(row.name, row.id));
  const who = el("span", "who");
  who.textContent = [nationFlag(row.country), row.country, row.name].filter(Boolean).join(" ");
  li.append(who);
  li.append(el("span", "mark", mark));
  return li;
}

function finishNode(race, view) {
  const root = el("div", "finish-body");
  if (view.podium.length) {
    root.append(el("p", "role", "Podium"));
    const list = el("ol", "board");
    for (const row of view.podium) list.append(resultRow(row, markText(row)));
    root.append(list);
  }
  if (!view.choices.length) return root.childNodes.length ? root : null;
  root.append(el("p", "role", "World Cup"));
  const picked = cupPick.get(race.id);
  const current = view.choices.find((choice) => choice.id === picked) || view.choices[0];
  if (view.choices.length > 1) {
    const group = el("div", "cup-switch");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "World Cup list");
    for (const choice of view.choices) {
      const button = el("button", "", choice.label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(choice.id === current.id));
      button.addEventListener("click", () => {
        cupPick.set(race.id, choice.id);
        const slot = button.closest("[data-finish]");
        if (slot) paintFinishSlot(slot, race);
      });
      group.append(button);
    }
    root.append(group);
  }
  const list = el("ol", "board");
  for (const row of standingRows(current, view.people)) {
    list.append(resultRow(row, row.points == null ? "" : String(row.points)));
  }
  root.append(list);
  return root;
}

function paintFinishSlot(slot, race) {
  const view = finishViews.get(race.id);
  if (!slot || !view) return;
  const node = finishNode(race, view);
  slot.replaceChildren(node || "");
}

async function ensureFinish() {
  const slots = [...document.querySelectorAll("[data-finish]")];
  await Promise.all(slots.map(async (slot) => {
    const race = races.find((item) => item.id === slot.dataset.finish);
    if (!race) return;
    const token = String((Number(slot.dataset.token) || 0) + 1);
    slot.dataset.token = token;
    const [book, relay] = await Promise.all([loadCups(), loadRelayPodium(race)]);
    if (slot.dataset.token !== token) return;
    const people = book?.people || {};
    const podium = presentPodium(relay, podiumFromStored(race), people);
    const choices = standingsChoices(book, race);
    if (!podium.length && !choices.length) {
      slot.replaceChildren();
      finishViews.delete(race.id);
      return;
    }
    finishViews.set(race.id, { podium, choices, people });
    paintFinishSlot(slot, race);
  }));
}

function readRaceCache(id) {
  try {
    const all = JSON.parse(localStorage.getItem(RACE_CACHE) || "{}");
    const hit = all[id];
    if (!hit?.payload || Date.now() - Number(hit.at) > 12 * 60 * 60 * 1000) return null;
    return hit;
  } catch {
    return null;
  }
}

function writeRaceCache(id, shown) {
  if (!shown?.payload) return;
  try {
    const all = JSON.parse(localStorage.getItem(RACE_CACHE) || "{}");
    all[id] = { at: shown.at, payload: shown.payload, field: shown.field || null };
    const ids = Object.keys(all);
    while (ids.length > 3) delete all[ids.shift()];
    localStorage.setItem(RACE_CACHE, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

function publishRace(session, now = Date.now()) {
  const shown = displayState({
    snapshots: session.buffer,
    delayMs: session.delayMs,
    now,
    cached: session.cached,
  });
  session.shown = shown;
  session.view = shown?.payload || null;
  session.viewAt = shown?.at ?? null;
  if (shown?.payload) writeRaceCache(session.raceId, shown);
}

function paintBadge(race) {
  const node = document.querySelector(`[data-badge="${race.id}"]`);
  if (!node) return;
  const session = liveSessions.get(race.id);
  node.textContent = badgeText(session?.shown?.payload || session?.payload);
}

function paintRace(race) {
  if (!raceEl || findRace(location.hash, races)?.id !== race.id) return;
  const session = liveSessions.get(race.id);
  const shown = session?.shown;
  const model = raceModel({
    payload: shown?.payload || null,
    field: shown?.field || null,
    at: shown?.at,
    now: Date.now(),
    judged: race.sport === "freeski",
  });
  renderRacePage(raceEl, {
    title: race.discipline,
    kicker: `${SPORT[race.sport]} · ${GENDER[race.gender]}`,
    venue: `${flag(race.country)} ${race.venue}`,
    when: raceCalendar(race).label,
    times: timesNode(race, "p"),
    team: contenderNode(race),
    model,
    updatedAt: shown?.at,
    delayMs: session?.delayMs || 0,
    delayOpen: !!session?.delayOpen,
    resultsOpen: !!session?.resultsOpen,
    syncNote: session?.syncNote || "",
    waiting: !shown && race.sport !== "freeski",
  }, {
    onBack: () => { location.hash = ""; },
    liveHref: liveTiming(race, clock)?.href || liveHref(race),
    canSync: (person) => {
      if (!session?.shown || session.viewAt == null) return false;
      return !!syncReady(session.starts, Number(session.shown.payload?.run) || 0, person, session.viewAt);
    },
    onSync: (person) => syncSkier(race.id, person),
    onNudge: (delta) => adjustDelay(race.id, nudgeDelay(session?.delayMs || 0, delta)),
    onLive: () => adjustDelay(race.id, 0),
    onToggleResults: () => {
      if (!session) return;
      session.resultsOpen = !session.resultsOpen;
      paintRace(race);
    },
    onToggleDelay: () => {
      if (!session) return;
      session.delayOpen = !session.delayOpen;
      paintRace(race);
    },
  });
}

function armRace(race) {
  const session = liveSessions.get(race.id);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = null;
  const timing = liveTiming(race, clock);
  const delay = pollDelay(session.status, {
    hidden: document.hidden,
    pulsing: timing?.pulsing,
    error: session.error,
  });
  if (delay == null) return;
  session.timer = setTimeout(() => { void pollRace(race); }, delay);
}

async function fetchCcXml(direct, signal) {
  const stamped = `${direct}${direct.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const urls = [
    stamped,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(stamped)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(stamped)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.includes("<lt>") && text.includes("</lt>")) return text;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
    }
  }
  return "";
}

async function pollRace(race) {
  const session = liveSessions.get(race.id);
  if (!session?.codex) return;
  clearTimeout(session.timer);
  session.timer = null;
  session.abort?.abort();
  const abort = new AbortController();
  session.abort = abort;
  try {
    const xmlUrl = timingXmlUrl(session.codex);
    const ccUrl = ccTimingUrl(session.codex);
    const [relay, xmlText, ccXml] = await Promise.all([
      fetch(relayUrl(session.codex, { top: 40, next: 40 }), { cache: "no-store", signal: abort.signal })
        .then(async (response) => {
          let data = null;
          try { data = await response.json(); } catch { data = null; }
          return { response, data };
        })
        .catch((err) => {
          if (err?.name === "AbortError") throw err;
          return { response: null, data: null };
        }),
      xmlUrl
        ? fetch(xmlUrl, { cache: "no-store", signal: abort.signal }).then((response) => (response.ok ? response.text() : "")).catch(() => "")
        : Promise.resolve(""),
      ccUrl ? fetchCcXml(ccUrl, abort.signal) : Promise.resolve(""),
    ]);
    if (abort.signal.aborted || liveSessions.get(race.id) !== session) return;
    const at = Date.now();
    const relayOk = !!(relay.response?.ok && livePayloadOk(relay.data, session.codex));
    const data = relayOk ? relay.data : (ccXml ? ccLivePayload(ccXml, session.codex) : null);
    if (livePayloadOk(data, session.codex)) {
      session.error = null;
      session.status = data.status;
      session.payload = data;
      session.starts = observeStarts(session.starts, data, at);
      const field = xmlText ? parseTimingXml(xmlText) : null;
      if (field) session.field = field;
      const cutoff = at - 20 * 60 * 1000;
      session.buffer = session.buffer.filter((snap) => snap.at >= cutoff);
      session.buffer.push({ at, payload: data, field: field || session.field || null });
    } else {
      session.error = "http";
    }
    publishRace(session, at);
    paintRace(race);
    paintBadge(race);
    armRace(race);
  } catch (err) {
    if (err?.name === "AbortError" || abort.signal.aborted) return;
    if (liveSessions.get(race.id) !== session) return;
    session.error = "http";
    paintRace(race);
    armRace(race);
  } finally {
    if (session.abort === abort) session.abort = null;
  }
}

function openFeed(race) {
  if (!race) return null;
  let session = liveSessions.get(race.id);
  if (!session) {
    const codex = liveCodex(race);
    const cached = readRaceCache(race.id);
    session = {
      raceId: race.id,
      codex,
      timer: null,
      abort: null,
      payload: cached?.payload || null,
      field: cached?.field || null,
      buffer: [],
      cached,
      shown: cached ? { ...cached, fromCache: true } : null,
      view: cached?.payload || null,
      viewAt: cached?.at ?? null,
      delayMs: codex ? readStoredDelay(codex) : 0,
      starts: emptyStartLog(),
      status: cached?.payload?.status || null,
      error: null,
      expanded: false,
      delayOpen: false,
      resultsOpen: false,
      syncNote: "",
      openedAt: Date.now(),
    };
    liveSessions.set(race.id, session);
    if (codex) void pollRace(race);
  } else if (session.codex && !session.timer && !session.abort && session.status !== "finished") {
    void pollRace(race);
  }
  return session;
}

function refreshOpenRace() {
  const race = findRace(location.hash, races);
  if (!race) return;
  const session = liveSessions.get(race.id);
  if (!session) return;
  const before = session.shown?.at;
  const beforeCache = session.shown?.fromCache;
  publishRace(session, Date.now());
  if (session.shown?.at !== before || session.shown?.fromCache !== beforeCache) paintRace(race);
  else {
    const age = raceEl?.querySelector(".age[data-at]");
    if (age) age.textContent = ageLabel(Number(age.dataset.at), Date.now());
  }
}

let routedId = "";

function applyRoute() {
  const race = findRace(location.hash, races);
  document.body.classList.toggle("on-race", !!race);
  if (!race || !raceEl) {
    if (raceEl) {
      raceEl.hidden = true;
      raceEl.replaceChildren();
    }
    routedId = "";
    return;
  }
  raceEl.hidden = false;
  openFeed(race);
  paintRace(race);
  if (routedId !== race.id) window.scrollTo(0, 0);
  routedId = race.id;
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
  const timing = !finished && liveTiming(race, now);
  if (timing) {
    const card = el("a", `${classes.join(" ")} race-open`);
    card.href = `#${raceSlug(race, races)}`;
    const bits = ["Live", SPORT[race.sport], GENDER[race.gender]];
    card.append(el("p", "kicker", bits.join(" · ")));
    card.append(el("h2", "", race.discipline));
    card.append(el("p", "venue", `${flag(race.country)} ${race.venue}, ${COUNTRY[race.country] || race.country}`));
    card.append(el("p", "when", raceCalendar(race).label));
    card.append(timesNode(race, "p"));
    const watching = contenderNode(race);
    if (watching) card.append(watching);
    openFeed(race);
    const badge = el("p", "live-badge");
    badge.dataset.badge = race.id;
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    badge.append(dot, document.createTextNode(` ${badgeText(liveSessions.get(race.id)?.shown?.payload)}`));
    card.append(badge);
    heroEl.append(card);
    return;
  }
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
  if (finished) card.append(finishSlot(race));
  if (!finished && liveCodex(race) && liveTiming(race, now)) card.append(liveSlot(race));
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
  } else if (liveCodex(race) && liveTiming(race, now)) {
    openFeed(race);
    const link = el("a", "live-badge small");
    link.href = `#${raceSlug(race, races)}`;
    link.dataset.badge = race.id;
    const dot = el("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    link.append(dot, document.createTextNode(` ${badgeText(liveSessions.get(race.id)?.shown?.payload)}`));
    body.append(link);
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
    const link = el("a", "race-open", `${who} · ${race.venue}`);
    link.href = `#${raceSlug(race, races)}`;
    card.append(link);
    if (liveCodex(race)) {
      openFeed(race);
      const badge = el("a", "live-badge small");
      badge.href = link.href;
      badge.dataset.badge = race.id;
      badge.textContent = badgeText(liveSessions.get(race.id)?.shown?.payload);
      card.append(badge);
    } else {
      card.append(liveLink(race, now));
    }
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
  ensureLive();
  void ensureFinish();
  applyRoute();
}

function tick() {
  const hero = nextRace(races, clock, filters);
  refreshOpenRace();
  refreshLiveViews();
  if (viewSignature() !== signature) {
    render();
    refreshAgo();
    return;
  }
  const node = heroEl.querySelector(".countdown");
  if (node && hero) {
    const text = headingText(hero, clock);
    node.textContent = text;
    node.className = text.length > 18 ? "countdown long" : "countdown";
  }
  refreshAgo();
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

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    for (const session of liveSessions.values()) {
      clearTimeout(session.timer);
      session.timer = null;
      session.abort?.abort();
      session.abort = null;
    }
    return;
  }
  if (!new URLSearchParams(location.search).get("asof")) clock = new Date();
  render();
});

function setupInstall() {
  const hint = document.querySelector("#install-hint");
  const copy = document.querySelector("#install-copy");
  const go = document.querySelector("#install-go");
  const dismiss = document.querySelector("#install-dismiss");
  if (!hint || !copy || !go || !dismiss) return;

  const standalone = standaloneDisplay({
    navigatorStandalone: navigator.standalone === true,
    displayMode: window.matchMedia?.("(display-mode: standalone)")?.matches ? "standalone" : "",
  });
  if (standalone) return;

  const apple = iosSafari(navigator.userAgent, {
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
  const ios = iosHintVisible({
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone: false,
    dismissed: stored(IOS_DISMISS_KEY, ["0", "1"], "0") === "1",
  });
  if (ios) {
    copy.textContent = IOS_INSTALL_COPY;
    go.hidden = true;
    hint.hidden = false;
  }

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    if (apple) return;
    event.preventDefault();
    deferred = event;
    copy.textContent = "Install the app on this device.";
    go.hidden = false;
    hint.hidden = false;
  });
  go.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* the browser closed the prompt */
    }
    deferred = null;
    hint.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    hint.hidden = true;
  });
  dismiss.addEventListener("click", () => {
    if (ios) save(IOS_DISMISS_KEY, "1");
    hint.hidden = true;
  });
}

window.addEventListener("hashchange", () => applyRoute());

setupInstall();

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
