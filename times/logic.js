/* Times-table memory for 1×1 through 10×10.

   a×b and b×a are separate facts. Seeing "8 × 7" is a different cue from
   seeing "7 × 8", and practicing only one order leaves the other shaky.
   The product is the same, so a miss on a hard pair can mention the twin,
   but the squares fill on their own.

   A square is mastered after MASTER_STREAK correct answers that each take
   FAST_MS or less, with no slow answer and no miss in between. Once it is
   mastered it stays mastered. A later miss or a slow answer marks it shaky
   so practice brings it back soon, and calm mastered facts wait out a
   growing interval, up to three weeks. */

export const FAST_MS = 4000;
export const MASTER_STREAK = 3;
export const SESSION_CARDS = 20;
export const SESSION_MS = 5 * 60 * 1000;
export const SPEED_MS = 60 * 1000;
export const STORAGE_KEY = "inga-times-v1";

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const TARGETS = 7;

export function factId(a, b) {
  return `${a}x${b}`;
}

export function parseId(id) {
  const match = /^([1-9]|10)x([1-9]|10)$/.exec(String(id));
  if (!match) return null;
  return { a: Number(match[1]), b: Number(match[2]) };
}

function clampInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

export function blankFact(a, b) {
  return {
    a,
    b,
    seen: 0,
    streak: 0,
    mastered: false,
    shaky: false,
    lapses: 0,
    due: 0,
    intervalMs: 0,
  };
}

function normalizeFact(a, b, raw) {
  const base = blankFact(a, b);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    a,
    b,
    seen: clampInt(raw.seen),
    streak: Math.min(MASTER_STREAK, clampInt(raw.streak)),
    mastered: raw.mastered === true,
    shaky: raw.shaky === true,
    lapses: clampInt(raw.lapses),
    due: clampInt(raw.due),
    intervalMs: clampInt(raw.intervalMs),
  };
}

export function freshState() {
  return { v: 1, facts: Object.create(null), bestSpeed: 0, rounds: 0 };
}

export function getFact(state, a, b) {
  return state.facts[factId(a, b)] || blankFact(a, b);
}

export function putFact(state, fact) {
  const facts = Object.assign(Object.create(null), state.facts);
  facts[factId(fact.a, fact.b)] = fact;
  return { ...state, facts };
}

export function levelOf(fact) {
  if (fact.mastered) return "mastered";
  if (!fact.seen) return "new";
  return "learning";
}

/** 0 easy (1, 2, 5, 10), 1 medium, 2 hard (6–9 together). */
export function difficultyBand(a, b) {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  if (x === 1 || y === 1 || x === 2 || y === 2 || x === 5 || y === 5 || x === 10 || y === 10) return 0;
  if (x >= 6 && y >= 6 && y <= 9) return 2;
  return 1;
}

export function isHard(a, b) {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  if (x <= 2 || x === 5 || y === 10 || x === 10) return false;
  return y >= 6 && x >= 3;
}

const LINES = {
  "3x6": "Three 6s: 6, 12, 18.",
  "3x7": "Three 7s: 7, 14, 21.",
  "3x8": "Three 8s: 8, 16, 24.",
  "6x6": "Six times six is 36.",
  "6x7": "6 × 7 = 42. Six 6s are 36, plus one more 6.",
  "6x8": "6 × 8 = 48. Five 8s are 40, plus one more 8.",
  "7x7": "7 × 7 = 49.",
  "7x8": "Five, six, seven, eight: 56 = 7 × 8.",
  "8x8": "8 × 8 = 64. A chessboard has 64 squares.",
};

export function memoryTrick(a, b) {
  if (!isHard(a, b)) return "";
  if (a === 9 || b === 9) {
    const n = a === 9 ? b : a;
    if (n >= 2 && n <= 9) {
      const tens = n - 1;
      const ones = 10 - n;
      return `Nines finger trick: fold finger ${n}. ${tens} on the left and ${ones} on the right makes ${tens * 10 + ones}.`;
    }
  }
  const line = LINES[`${a}x${b}`] || LINES[`${b}x${a}`];
  if (line) return line;
  if (a === 4 || b === 4) {
    const n = a === 4 ? b : a;
    const doubled = n * 2;
    return `Fours: double ${n} is ${doubled}, then double again is ${doubled * 2}.`;
  }
  return `${a} × ${b} = ${a * b}.`;
}

export function applyAnswer(fact, answer, now) {
  const correct = answer.correct === true;
  const elapsedMs = Number(answer.elapsedMs);
  const fast = correct && Number.isFinite(elapsedMs) && elapsedMs <= FAST_MS;
  const next = { ...fact, seen: fact.seen + 1 };
  let justMastered = false;

  if (!correct) {
    next.lapses = fact.lapses + 1;
    next.due = now;
    next.shaky = fact.mastered;
    if (!fact.mastered) next.streak = 0;
    return { fact: next, correct, fast: false, slow: false, justMastered };
  }

  if (!fast) {
    next.due = now;
    if (fact.mastered) next.shaky = true;
    else next.streak = 0;
    return { fact: next, correct, fast: false, slow: true, justMastered };
  }

  if (!fact.mastered) {
    next.streak = fact.streak + 1;
    if (next.streak >= MASTER_STREAK) {
      next.streak = MASTER_STREAK;
      next.mastered = true;
      next.shaky = false;
      next.intervalMs = DAY;
      next.due = now + DAY;
      justMastered = true;
    } else {
      next.due = now;
    }
  } else if (fact.shaky) {
    next.shaky = false;
    next.intervalMs = 10 * MIN;
    next.due = now + 10 * MIN;
  } else {
    const grown = Math.min(21 * DAY, Math.max(DAY, (fact.intervalMs || DAY) * 2));
    next.intervalMs = grown;
    next.due = now + grown;
  }

  return { fact: next, correct, fast: true, slow: false, justMastered };
}

export function isRowMastered(state, a) {
  for (let b = 1; b <= 10; b += 1) {
    if (!getFact(state, a, b).mastered) return false;
  }
  return true;
}

export function completedRows(before, after) {
  const rows = [];
  for (let a = 1; a <= 10; a += 1) {
    if (!isRowMastered(before, a) && isRowMastered(after, a)) rows.push(a);
  }
  return rows;
}

export function counts(state) {
  const tally = { mastered: 0, learning: 0, fresh: 0 };
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const level = levelOf(getFact(state, a, b));
      if (level === "mastered") tally.mastered += 1;
      else if (level === "learning") tally.learning += 1;
      else tally.fresh += 1;
    }
  }
  return tally;
}

export function hasProgress(state) {
  if (state.bestSpeed > 0 || state.rounds > 0) return true;
  return Object.keys(state.facts).length > 0;
}

export function shuffle(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function pickUnseen(state, limit, rand) {
  const bands = [[], [], []];
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const fact = getFact(state, a, b);
      if (fact.seen === 0) bands[difficultyBand(a, b)].push(fact);
    }
  }
  for (const list of bands) {
    const mixed = shuffle(list, rand);
    list.length = 0;
    list.push(...mixed);
  }
  const pattern = [0, 1, 2, 0, 1, 0, 2, 1];
  const out = [];
  let spins = 0;
  while (out.length < limit && spins < 40) {
    spins += 1;
    let moved = false;
    for (const band of pattern) {
      if (out.length >= limit) break;
      const next = bands[band].pop();
      if (next) {
        out.push(next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function repsFor(fact) {
  if (fact.mastered && !fact.shaky) return 1;
  return Math.max(1, MASTER_STREAK - Math.min(fact.streak, MASTER_STREAK));
}

function separateRepeats(queue) {
  const out = [];
  const pending = [];
  for (const id of queue) {
    if (out.length && out[out.length - 1] === id) pending.push(id);
    else out.push(id);
  }
  for (const id of pending) {
    let placed = false;
    for (let i = 0; i <= out.length; i += 1) {
      const prev = out[i - 1];
      const next = out[i];
      if (prev !== id && next !== id) {
        out.splice(i, 0, id);
        placed = true;
        break;
      }
    }
    if (!placed) out.push(id);
  }
  return out;
}

export function buildSession(state, now, rand = Math.random) {
  const learning = [];
  const shaky = [];
  const calmDue = [];
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const fact = getFact(state, a, b);
      if (!fact.mastered && fact.seen > 0 && fact.due <= now) learning.push(fact);
      else if (fact.mastered && fact.shaky && fact.due <= now) shaky.push(fact);
      else if (fact.mastered && fact.due <= now) calmDue.push(fact);
    }
  }

  const byNeed = (left, right) => right.streak - left.streak || right.lapses - left.lapses;
  const review = shuffle(shaky, rand).concat(shuffle(learning, rand).sort(byNeed));
  const targets = [];
  const seen = new Set();
  const add = (fact) => {
    if (targets.length >= TARGETS) return false;
    const id = factId(fact.a, fact.b);
    if (seen.has(id)) return false;
    seen.add(id);
    targets.push(fact);
    return true;
  };

  for (const fact of review) add(fact);

  const room = Math.max(0, TARGETS - targets.length);
  const newCap = review.length >= 5 ? Math.min(2, room) : room;
  if (newCap > 0) {
    for (const fact of pickUnseen(state, newCap, rand)) add(fact);
  }

  if (targets.length < 5) {
    let added = 0;
    for (const fact of shuffle(calmDue, rand)) {
      if (added >= 2) break;
      if (add(fact)) added += 1;
    }
  }

  if (targets.length === 0) {
    const all = [];
    for (let a = 1; a <= 10; a += 1) {
      for (let b = 1; b <= 10; b += 1) all.push(factId(a, b));
    }
    return shuffle(all, rand).slice(0, 10);
  }

  if (targets.length < 3) {
    for (const fact of pickUnseen(state, 4, rand)) add(fact);
    if (targets.length < 3) {
      const rest = [];
      for (let a = 1; a <= 10; a += 1) {
        for (let b = 1; b <= 10; b += 1) rest.push(getFact(state, a, b));
      }
      for (const fact of shuffle(rest, rand)) {
        if (targets.length >= 3) break;
        add(fact);
      }
    }
  }

  const passes = [[], [], []];
  for (const fact of targets) {
    const copies = Math.min(3, repsFor(fact));
    const id = factId(fact.a, fact.b);
    for (let i = 0; i < copies; i += 1) passes[i].push(id);
  }
  const flat = [];
  for (const pass of passes) flat.push(...shuffle(pass, rand));
  const queue = separateRepeats(flat);
  if (queue.length > SESSION_CARDS) return queue.slice(0, SESSION_CARDS);
  return queue;
}

/** Put a missed or slow fact back into the remaining queue, sooner for a miss. */
export function requeue(queue, id, gap) {
  const ahead = queue.slice(0, gap + 1);
  if (ahead.includes(id)) return queue.slice();
  if (queue.filter((item) => item === id).length >= 2) return queue.slice();
  const next = queue.slice();
  next.splice(Math.min(next.length, Math.max(0, gap)), 0, id);
  return separateRepeats(next);
}

export function pickSpeed(state, recentIds, rand = Math.random) {
  const recent = new Set((recentIds || []).slice(-4));
  const pool = [];
  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const fact = getFact(state, a, b);
      const id = factId(a, b);
      if (recent.has(id)) continue;
      let weight = fact.mastered && !fact.shaky ? 1 : fact.seen === 0 ? 2 : 5;
      if (fact.shaky || (!fact.mastered && fact.lapses > 0)) weight += 3;
      pool.push({ id, weight });
    }
  }
  if (!pool.length) return pickSpeed(state, (recentIds || []).slice(-1), rand);
  let total = 0;
  for (const item of pool) total += item.weight;
  let roll = rand() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return pool[pool.length - 1].id;
}

export function recordSpeed(state, score) {
  const safe = Math.max(0, Math.min(300, Math.floor(Number(score)) || 0));
  const first = state.rounds === 0;
  const previousBest = state.bestSpeed;
  const isRecord = safe > previousBest && safe > 0;
  return {
    state: {
      ...state,
      rounds: state.rounds + 1,
      bestSpeed: Math.max(previousBest, safe),
    },
    score: safe,
    first,
    isRecord,
    previousBest,
  };
}

export function hydrate(raw) {
  if (!raw || typeof raw !== "string") return freshState();
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.facts || typeof data.facts !== "object" || Array.isArray(data.facts)) {
      return freshState();
    }
    const facts = Object.create(null);
    for (const [id, fact] of Object.entries(data.facts)) {
      const parsed = parseId(id);
      if (!parsed) continue;
      facts[id] = normalizeFact(parsed.a, parsed.b, fact);
    }
    return {
      v: 1,
      facts,
      bestSpeed: Math.min(300, clampInt(data.bestSpeed)),
      rounds: clampInt(data.rounds),
    };
  } catch {
    return freshState();
  }
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return function rand() {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
