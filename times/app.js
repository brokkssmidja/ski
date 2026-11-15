import {
  MASTER_STREAK,
  SESSION_CARDS,
  SESSION_MS,
  SPEED_MS,
  STORAGE_KEY,
  applyAnswer,
  buildSession,
  completedRows,
  counts,
  factId,
  freshState,
  getFact,
  hasProgress,
  hydrate,
  isRowMastered,
  levelOf,
  memoryTrick,
  parseId,
  pickSpeed,
  putFact,
  recordSpeed,
  requeue,
} from "./logic.js";

const $ = (id) => document.getElementById(id);

const home = $("home");
const play = $("play");
const sprint = $("sprint");
const summary = $("summary");
const screens = [home, play, sprint, summary];

const grid = $("grid");
const litNum = $("lit-num");
const gridSummary = $("grid-summary");
const cellInfo = $("cell-info");
const bestLabel = $("best-label");

const playCount = $("play-count");
const playTime = $("play-time");
const playBar = $("play-bar");
const playProblem = $("play-problem");
const playEntry = $("play-entry");
const playNote = $("play-note");
const playTrick = $("play-trick");
const playPad = $("play-pad");
const playContinue = $("play-continue");

const speedScoreEl = $("speed-score");
const speedBestEl = $("speed-best");
const speedTime = $("speed-time");
const speedBar = $("speed-bar");
const speedProblem = $("speed-problem");
const speedEntry = $("speed-entry");
const speedNote = $("speed-note");
const speedHint = $("speed-hint");
const speedPad = $("speed-pad");

const sumKicker = $("sum-kicker");
const sumTitle = $("sum-title");
const sumDetail = $("sum-detail");
const sumExtra = $("sum-extra");

const celebrate = $("celebrate");
const celebrateKicker = $("celebrate-kicker");
const celebrateTitle = $("celebrate-title");
const celebrateSub = $("celebrate-sub");
const celebrateRow = $("celebrate-row");
const celebrateGo = $("celebrate-go");

const resetDialog = $("reset-dialog");
const resetTitle = $("reset-title");
const resetCopy = $("reset-copy");
const resetHold = $("reset-hold");
const resetCancel = $("reset-cancel");

const cells = new Map();
const rowHeads = new Map();
const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clock = createClock();
let state = load();
let mode = "home";
let generation = 0;
let reviewTimer = 0;
let tickTimer = 0;
let hiddenPause = false;
let reviewing = false;
let locked = false;
let selected = "";

let queue = [];
let answered = 0;
let right = 0;
let wrong = 0;
let litIds = [];
let rowIds = [];
let endAfterCard = false;

let speedScore = 0;
let speedRecent = [];
let speedLit = [];
let speedRows = [];

let entry = "";
let current = null;
let cardAt = 0;
let summaryKind = "practice";
let summaryLit = [];

function load() {
  try {
    return hydrate(localStorage.getItem(STORAGE_KEY));
  } catch {
    return freshState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Private mode can block storage. This visit still works. */
  }
}

function createClock() {
  let start = 0;
  let pausedFor = 0;
  let pauseBegan = null;
  let depth = 0;
  let limit = 0;
  let running = false;
  return {
    begin(ms) {
      start = performance.now();
      pausedFor = 0;
      pauseBegan = null;
      depth = 0;
      limit = ms;
      running = true;
    },
    stop() {
      running = false;
      depth = 0;
      pauseBegan = null;
    },
    get running() {
      return running;
    },
    pause() {
      if (!running) return;
      if (depth === 0) pauseBegan = performance.now();
      depth += 1;
    },
    resume() {
      if (!running || depth === 0) return;
      depth -= 1;
      if (depth === 0 && pauseBegan != null) {
        pausedFor += performance.now() - pauseBegan;
        pauseBegan = null;
      }
    },
    left() {
      if (!running) return 0;
      const now = performance.now();
      const open = pauseBegan != null ? now - pauseBegan : 0;
      return Math.max(0, limit - (now - start - pausedFor - open));
    },
  };
}

function formatRemain(ms) {
  const total = Math.max(0, Math.ceil(Math.max(0, ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSeconds(ms) {
  return String(Math.max(0, Math.ceil(Math.max(0, ms) / 1000)));
}

function show(id) {
  mode = id;
  for (const screen of screens) screen.hidden = screen.id !== id;
}

function clearConfetti() {
  document.querySelectorAll(".confetti").forEach((node) => node.remove());
}

function shutdown() {
  generation += 1;
  window.clearTimeout(reviewTimer);
  window.clearInterval(tickTimer);
  tickTimer = 0;
  clock.stop();
  hiddenPause = false;
  reviewing = false;
  locked = false;
  celebrate.hidden = true;
  play.inert = false;
  setAnswering(true);
  clearConfetti();
}

function startTicks(render) {
  window.clearInterval(tickTimer);
  render();
  tickTimer = window.setInterval(render, 200);
}

function onceLater(ms, fn) {
  const gen = generation;
  let used = false;
  const run = () => {
    if (used || gen !== generation) return;
    used = true;
    window.clearTimeout(timer);
    fn();
  };
  const timer = window.setTimeout(run, ms);
  reviewTimer = timer;
  return run;
}

function enterReview() {
  if (!reviewing) {
    reviewing = true;
    clock.pause();
  }
  locked = true;
}

function burst(count) {
  if (!motionOK) return;
  const colors = ["#f6b14a", "#148077", "#ee7a34", "#fffaf4", "#241c16"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement("span");
    bit.style.left = `${8 + Math.random() * 84}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 90}ms`;
    bit.style.transform = `rotate(${Math.random() * 80}deg)`;
    layer.append(bit);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 1300);
}

function nudge(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function buildGrid() {
  grid.replaceChildren();
  const corner = document.createElement("div");
  corner.className = "corner";
  corner.textContent = "×";
  grid.append(corner);
  for (let b = 1; b <= 10; b += 1) {
    const head = document.createElement("div");
    head.className = "head";
    head.textContent = String(b);
    grid.append(head);
  }
  for (let a = 1; a <= 10; a += 1) {
    const head = document.createElement("div");
    head.className = "head";
    head.textContent = String(a);
    rowHeads.set(a, head);
    grid.append(head);
    for (let b = 1; b <= 10; b += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.a = String(a);
      cell.dataset.b = String(b);
      cell.addEventListener("click", () => selectCell(a, b));
      cells.set(factId(a, b), cell);
      grid.append(cell);
    }
  }
}

function describe(fact) {
  const eq = `${fact.a} × ${fact.b}`;
  if (fact.mastered) return `${eq} = ${fact.a * fact.b} · mastered`;
  if (!fact.seen) return `${eq} · not yet`;
  const left = MASTER_STREAK - fact.streak;
  if (fact.streak === 0) return `${eq} · learning · three quick answers to go`;
  if (left === 1) return `${eq} · learning · one quick answer to go`;
  return `${eq} · learning · ${left} quick answers to go`;
}

function paintGrid(justIds) {
  const just = new Set(justIds || []);
  for (let a = 1; a <= 10; a += 1) {
    rowHeads.get(a).classList.toggle("done", isRowMastered(state, a));
    for (let b = 1; b <= 10; b += 1) {
      const id = factId(a, b);
      const fact = getFact(state, a, b);
      const level = levelOf(fact);
      const cell = cells.get(id);
      cell.className = `cell ${level}`;
      if (selected === id) cell.classList.add("is-selected");
      if (just.has(id)) cell.classList.add("just-lit");
      cell.textContent = level === "mastered" ? String(a * b) : "";
      if (level === "learning") cell.dataset.streak = String(fact.streak);
      else delete cell.dataset.streak;
    }
  }
  const tally = counts(state);
  litNum.textContent = String(tally.mastered);
  gridSummary.textContent = `${tally.mastered} mastered, ${tally.learning} learning, ${tally.fresh} not yet.`;
  bestLabel.textContent = state.bestSpeed > 0 ? `Best ${state.bestSpeed}` : "60 seconds";
  if (just.size) {
    window.setTimeout(() => {
      for (const id of just) cells.get(id)?.classList.remove("just-lit");
    }, 900);
  }
}

function renderHome(justIds) {
  paintGrid(justIds);
  if (!selected) cellInfo.textContent = "Tap a square.";
  else {
    const parsed = parseId(selected);
    cellInfo.textContent = describe(getFact(state, parsed.a, parsed.b));
  }
}

function selectCell(a, b) {
  const id = factId(a, b);
  selected = selected === id ? "" : id;
  renderHome();
}

function backToGrid(lit) {
  const just = (lit || []).slice();
  shutdown();
  show("home");
  renderHome(just);
}

function progressSentence(lit, rows) {
  const parts = [];
  if (lit.length === 1) parts.push("1 square mastered.");
  else if (lit.length > 1) parts.push(`${lit.length} squares mastered.`);
  if (counts(state).mastered === 100 && lit.length) {
    parts.push("The whole grid is mastered.");
    return parts.join(" ");
  }
  if (rows.length === 1) parts.push(`The ${rows[0]} times table is yours.`);
  else if (rows.length > 1) {
    const last = rows[rows.length - 1];
    parts.push(`The ${rows.slice(0, -1).join(", ")} and ${last} times tables are yours.`);
  }
  return parts.join(" ");
}

function showSummary({ kicker, title, detail, extra, party }) {
  summaryLit = (summaryLit || []).slice();
  sumKicker.textContent = kicker;
  sumTitle.textContent = title;
  sumDetail.textContent = detail;
  sumExtra.hidden = !extra;
  sumExtra.textContent = extra || "";
  show("summary");
  if (party) burst(32);
  sumTitle.focus({ preventScroll: true });
}

function showProblem(el, card) {
  el.textContent = `${card.a} × ${card.b}`;
  el.setAttribute("aria-label", `${card.a} times ${card.b}`);
  nudge(el, "swap");
}

function clearEntry(el) {
  entry = "";
  el.classList.remove("is-good", "is-slow", "is-miss");
  el.textContent = "";
}

function syncPad(pad) {
  const ok = pad.querySelector('[data-key="ok"]');
  const del = pad.querySelector('[data-key="del"]');
  ok.disabled = entry.length === 0;
  del.disabled = entry.length === 0;
}

function setAnswering(on) {
  playPad.hidden = !on;
  playContinue.hidden = on;
}

function renderPlayClock() {
  const left = clock.left();
  playTime.textContent = formatRemain(left);
  playBar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / SESSION_MS))})`;
  if (!reviewing && left <= 0) endAfterCard = true;
}

function renderPracticeFace() {
  playCount.textContent = `${Math.min(answered + 1, SESSION_CARDS)} / ${SESSION_CARDS}`;
  showProblem(playProblem, current);
  clearEntry(playEntry);
  playNote.textContent = "";
  playTrick.hidden = true;
  playTrick.textContent = "";
  syncPad(playPad);
}

function nextPracticeCard() {
  if (generation !== nextPracticeCard.gen) return;
  if (reviewing) {
    reviewing = false;
    clock.resume();
  }
  celebrate.hidden = true;
  play.inert = false;
  setAnswering(true);
  if (endAfterCard || answered >= SESSION_CARDS || queue.length === 0) {
    finishPractice();
    return;
  }
  current = parseId(queue.shift());
  cardAt = performance.now();
  locked = false;
  renderPracticeFace();
}

function finishPractice() {
  if (mode !== "play") return;
  const snapshot = {
    answered,
    right,
    wrong,
    lit: litIds.slice(),
    rows: rowIds.slice(),
    endAfterCard,
  };
  summaryLit = snapshot.lit;
  shutdown();
  const total = snapshot.right + snapshot.wrong;
  const ratio = total ? snapshot.right / total : 1;
  let title = "Nice round.";
  if (!total) title = "Nothing this time.";
  else if (ratio >= 0.85) title = "Sharp.";
  else if (ratio < 0.5) title = "Good practice.";
  let kicker = "That's the set";
  if (snapshot.answered >= SESSION_CARDS) kicker = "20 cards";
  else if (snapshot.endAfterCard) kicker = "Five minutes";
  const detail = snapshot.wrong
    ? `${snapshot.right} right · ${snapshot.wrong} to see again`
    : `${snapshot.right} right.`;
  showSummary({
    kicker,
    title,
    detail,
    extra: progressSentence(snapshot.lit, snapshot.rows),
    party: snapshot.lit.length > 0 || snapshot.rows.length > 0,
  });
}

function gradeCurrent(elapsed) {
  const correct = Number(entry) === current.a * current.b;
  const before = state;
  const id = factId(current.a, current.b);
  const applied = applyAnswer(getFact(state, current.a, current.b), { correct, elapsedMs: elapsed }, Date.now());
  state = putFact(state, applied.fact);
  save();
  const rows = completedRows(before, state);
  return { correct, applied, id, rows, allNow: counts(before).mastered < 100 && counts(state).mastered === 100 };
}

function openCelebrate({ kicker, title, sub, showRow }, done) {
  celebrateKicker.textContent = kicker;
  celebrateTitle.textContent = title;
  celebrateSub.textContent = sub;
  celebrateRow.hidden = !showRow;
  if (showRow && !celebrateRow.childElementCount) {
    for (let i = 0; i < 10; i += 1) celebrateRow.append(document.createElement("i"));
  }
  celebrate.hidden = false;
  play.inert = true;
  burst(36);
  const go = onceLater(2400, () => {
    celebrate.hidden = true;
    play.inert = false;
    done();
  });
  celebrateGo.onclick = go;
  celebrateGo.focus();
}

function presentPractice(result) {
  enterReview();
  const { correct, applied, rows, allNow } = result;
  const value = current.a * current.b;
  if (!correct) {
    playEntry.textContent = String(value);
    playEntry.classList.remove("is-good", "is-slow");
    playEntry.classList.add("is-miss");
    nudge(playProblem, "shake");
    playNote.textContent = "Not yet.";
    const trick = memoryTrick(current.a, current.b);
    playTrick.hidden = !trick;
    playTrick.textContent = trick;
    setAnswering(false);
    const go = onceLater(4800, () => nextPracticeCard());
    playContinue.onclick = go;
    playContinue.focus();
    return;
  }
  playEntry.classList.add(applied.fast ? "is-good" : "is-slow");
  if (allNow) {
    openCelebrate({
      kicker: "Every square",
      title: "The whole grid is mastered.",
      sub: "1 × 1 through 10 × 10.",
      showRow: false,
    }, () => nextPracticeCard());
    return;
  }
  if (rows.length) {
    openCelebrate({
      kicker: "A whole table",
      title: `The ${rows[0]} times table is mastered.`,
      sub: `Every fact from ${rows[0]} × 1 to ${rows[0]} × 10.`,
      showRow: true,
    }, () => nextPracticeCard());
    return;
  }
  if (applied.justMastered) {
    playNote.textContent = "That square is mastered.";
    burst(18);
  } else if (applied.slow && applied.fact.mastered) {
    playNote.textContent = "Right — a little slow, so this one comes back sooner.";
  } else if (applied.slow) {
    playNote.textContent = "Right — a little slow, so that one starts over.";
  } else {
    playNote.textContent = "Yes.";
  }
  const wait = applied.justMastered ? 1100 : applied.fast ? 560 : 980;
  onceLater(wait, () => nextPracticeCard());
}

function submitPractice() {
  if (locked || mode !== "play" || !current || !entry) return;
  locked = true;
  const elapsed = performance.now() - cardAt;
  const result = gradeCurrent(elapsed);
  answered += 1;
  if (result.correct) right += 1;
  else wrong += 1;
  if (result.applied.justMastered) litIds.push(result.id);
  for (const row of result.rows) {
    if (!rowIds.includes(row)) rowIds.push(row);
  }
  if (!result.correct) queue = requeue(queue, result.id, 2);
  else if (result.applied.slow) queue = requeue(queue, result.id, 5);
  nextPracticeCard.gen = generation;
  presentPractice(result);
}

function startPractice() {
  shutdown();
  queue = buildSession(state, Date.now());
  answered = 0;
  right = 0;
  wrong = 0;
  litIds = [];
  rowIds = [];
  endAfterCard = false;
  summaryKind = "practice";
  summaryLit = [];
  clock.begin(SESSION_MS);
  show("play");
  startTicks(renderPlayClock);
  nextPracticeCard.gen = generation;
  nextPracticeCard();
}

function renderSpeedClock() {
  const left = clock.left();
  speedTime.textContent = formatSeconds(left);
  speedBar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / SPEED_MS))})`;
  speedBar.parentElement.classList.toggle("is-low", left <= 10000);
  if (!reviewing && left <= 0) finishSpeed();
}

function renderSpeedFace() {
  showProblem(speedProblem, current);
  clearEntry(speedEntry);
  speedNote.textContent = "";
  syncPad(speedPad);
}

function nextSpeedCard() {
  if (mode !== "sprint") return;
  if (reviewing) {
    reviewing = false;
    clock.resume();
  }
  if (clock.left() <= 0) {
    finishSpeed();
    return;
  }
  const id = pickSpeed(state, speedRecent);
  speedRecent.push(id);
  current = parseId(id);
  cardAt = performance.now();
  locked = false;
  renderSpeedFace();
}

function finishSpeed() {
  if (mode !== "sprint") return;
  const result = recordSpeed(state, speedScore);
  state = result.state;
  save();
  const lit = speedLit.slice();
  const rows = speedRows.slice();
  summaryLit = lit;
  shutdown();
  let title = `${result.score} right`;
  let detail = `Your best is ${result.state.bestSpeed}.`;
  let party = false;
  if (result.first && result.score === 0) {
    detail = "Have another go whenever you want.";
  } else if (result.first) {
    detail = "That’s the one to beat.";
    party = true;
  } else if (result.isRecord) {
    title = "New best.";
    detail = `${result.score} right. The old one was ${result.previousBest}.`;
    party = true;
  }
  showSummary({
    kicker: "Speed round",
    title,
    detail,
    extra: progressSentence(lit, rows),
    party,
  });
}

function submitSpeed() {
  if (locked || mode !== "sprint" || !current || !entry) return;
  if (clock.left() <= 0) {
    finishSpeed();
    return;
  }
  locked = true;
  const elapsed = performance.now() - cardAt;
  const result = gradeCurrent(elapsed);
  if (result.correct) {
    speedScore += 1;
    speedScoreEl.textContent = `${speedScore} right`;
    nudge(speedScoreEl, "pop");
    speedEntry.classList.add("is-good");
  } else {
    const value = current.a * current.b;
    speedEntry.textContent = String(value);
    speedEntry.classList.add("is-miss");
    speedNote.textContent = "Not yet.";
    nudge(speedProblem, "shake");
  }
  if (result.applied.justMastered) speedLit.push(result.id);
  for (const row of result.rows) {
    if (!speedRows.includes(row)) speedRows.push(row);
  }
  if (result.correct) {
    onceLater(80, () => nextSpeedCard());
    return;
  }
  enterReview();
  onceLater(700, () => nextSpeedCard());
}

function startSpeed() {
  shutdown();
  speedScore = 0;
  speedRecent = [];
  speedLit = [];
  speedRows = [];
  summaryKind = "speed";
  summaryLit = [];
  speedScoreEl.textContent = "0 right";
  speedBestEl.textContent = state.bestSpeed > 0 ? `Best ${state.bestSpeed}` : "First round";
  speedHint.hidden = state.rounds > 0;
  clock.begin(SPEED_MS);
  show("sprint");
  startTicks(renderSpeedClock);
  nextSpeedCard();
}

function pushDigit(digit) {
  if (locked || !current) return;
  if (entry.length >= 3) return;
  entry += digit;
  const el = mode === "sprint" ? speedEntry : playEntry;
  const pad = mode === "sprint" ? speedPad : playPad;
  el.classList.remove("is-good", "is-slow", "is-miss");
  el.textContent = entry;
  syncPad(pad);
  if (mode === "sprint" && entry.length === String(current.a * current.b).length) submitSpeed();
}

function popDigit() {
  if (locked || !entry) return;
  entry = entry.slice(0, -1);
  const el = mode === "sprint" ? speedEntry : playEntry;
  const pad = mode === "sprint" ? speedPad : playPad;
  el.textContent = entry;
  syncPad(pad);
}

function bindPad(pad) {
  pad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || !pad.contains(button)) return;
    const key = button.dataset.key;
    if (pad === playPad && mode !== "play") return;
    if (pad === speedPad && mode !== "sprint") return;
    if (key === "del") popDigit();
    else if (key === "ok") {
      if (mode === "play") submitPractice();
      else submitSpeed();
    } else pushDigit(key);
  });
}

function openReset() {
  const empty = !hasProgress(state);
  resetTitle.textContent = empty ? "Nothing to erase" : "Erase everything on this device?";
  resetCopy.textContent = empty
    ? "The grid is still clear."
    : "This clears the squares, what practice remembers, and the speed-round best.";
  resetHold.hidden = empty;
  resetHold.style.setProperty("--hold", "0");
  resetCancel.textContent = empty ? "OK" : "Keep my squares";
  resetDialog.showModal();
}

let holding = false;
let holdStart = 0;
let holdFrame = 0;
const HOLD_MS = 1400;

function startHold(event) {
  if (holding || resetHold.hidden) return;
  holding = true;
  holdStart = performance.now();
  if (event && event.pointerId != null) {
    try { resetHold.setPointerCapture(event.pointerId); } catch { /* already released */ }
  }
  const step = (now) => {
    if (!holding) return;
    const amount = Math.min(1, (now - holdStart) / HOLD_MS);
    resetHold.style.setProperty("--hold", String(amount));
    if (amount >= 1) {
      holding = false;
      doReset();
      return;
    }
    holdFrame = requestAnimationFrame(step);
  };
  holdFrame = requestAnimationFrame(step);
}

function cancelHold() {
  if (!holding) return;
  holding = false;
  cancelAnimationFrame(holdFrame);
  resetHold.style.setProperty("--hold", "0");
}

function doReset() {
  holding = false;
  cancelAnimationFrame(holdFrame);
  resetHold.style.setProperty("--hold", "0");
  state = freshState();
  save();
  selected = "";
  if (resetDialog.open) resetDialog.close();
  show("home");
  renderHome();
  cellInfo.textContent = "Erased. The grid is clear.";
}

document.addEventListener("visibilitychange", () => {
  if (!clock.running) return;
  if (document.hidden) {
    if (!hiddenPause) {
      hiddenPause = true;
      clock.pause();
    }
  } else if (hiddenPause) {
    hiddenPause = false;
    clock.resume();
  }
});

document.addEventListener("keydown", (event) => {
  if (resetDialog.open) return;
  if (!celebrate.hidden) {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      celebrateGo.click();
    }
    return;
  }
  if (mode === "play" && !playContinue.hidden) {
    if (event.key === "Enter") {
      event.preventDefault();
      playContinue.click();
    }
    return;
  }
  if (mode !== "play" && mode !== "sprint") return;
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    pushDigit(event.key);
  } else if (event.key === "Backspace") {
    event.preventDefault();
    popDigit();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (mode === "play") submitPractice();
    else submitSpeed();
  }
});

buildGrid();
bindPad(playPad);
bindPad(speedPad);
renderHome();
syncPad(playPad);
syncPad(speedPad);

$("start-practice").addEventListener("click", startPractice);
$("start-speed").addEventListener("click", startSpeed);
$("play-back").addEventListener("click", () => backToGrid(litIds));
$("speed-back").addEventListener("click", () => backToGrid(speedLit));
$("sum-home").addEventListener("click", () => backToGrid(summaryLit));
$("sum-again").addEventListener("click", () => {
  if (summaryKind === "speed") startSpeed();
  else startPractice();
});
$("open-reset").addEventListener("click", openReset);
resetCancel.addEventListener("click", () => resetDialog.close());
resetDialog.addEventListener("close", cancelHold);
resetHold.addEventListener("pointerdown", startHold);
resetHold.addEventListener("pointerup", cancelHold);
resetHold.addEventListener("pointercancel", cancelHold);
resetHold.addEventListener("contextmenu", (event) => event.preventDefault());
resetHold.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    startHold();
  }
});
resetHold.addEventListener("keyup", (event) => {
  if (event.key === " " || event.key === "Enter") cancelHold();
});

nextPracticeCard.gen = 0;
