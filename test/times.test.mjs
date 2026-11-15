import assert from "node:assert/strict";
import test from "node:test";
import {
  FAST_MS,
  MASTER_STREAK,
  SESSION_CARDS,
  applyAnswer,
  blankFact,
  buildSession,
  completedRows,
  counts,
  difficultyBand,
  factId,
  freshState,
  getFact,
  hasProgress,
  hydrate,
  isHard,
  isRowMastered,
  memoryTrick,
  mulberry32,
  pickSpeed,
  putFact,
  recordSpeed,
  requeue,
} from "../times/logic.js";

const NOW = 1_700_000_000_000;

function fast(fact, now = NOW) {
  return applyAnswer(fact, { correct: true, elapsedMs: 900 }, now);
}

test("three quick right answers light a square, and the twin stays dark", () => {
  let fact = blankFact(7, 8);
  fact = fast(fact).fact;
  assert.equal(fact.mastered, false);
  assert.equal(fact.streak, 1);
  fact = fast(fact).fact;
  fact = fast(fact).fact;
  assert.equal(fact.mastered, true);
  assert.equal(fact.streak, MASTER_STREAK);

  let state = putFact(freshState(), fact);
  assert.equal(getFact(state, 7, 8).mastered, true);
  assert.equal(getFact(state, 8, 7).mastered, false);
  assert.equal(factId(7, 8) === factId(8, 7), false);
});

test("a miss or a slow answer starts the quick count over", () => {
  let fact = blankFact(6, 8);
  fact = fast(fact).fact;
  fact = fast(fact).fact;
  const slow = applyAnswer(fact, { correct: true, elapsedMs: FAST_MS + 1 }, NOW);
  assert.equal(slow.slow, true);
  assert.equal(slow.fact.streak, 0);
  assert.equal(slow.fact.mastered, false);

  fact = fast(blankFact(6, 7)).fact;
  fact = fast(fact).fact;
  const missed = applyAnswer(fact, { correct: false, elapsedMs: 500 }, NOW);
  assert.equal(missed.fact.streak, 0);
  assert.equal(missed.fact.mastered, false);
  assert.equal(missed.fact.lapses, 1);
});

test("the fast boundary is inclusive", () => {
  const fact = blankFact(2, 2);
  assert.equal(applyAnswer(fact, { correct: true, elapsedMs: FAST_MS }, NOW).fast, true);
  assert.equal(applyAnswer(fact, { correct: true, elapsedMs: FAST_MS + 1 }, NOW).fast, false);
});

test("a mastered square stays lit, and a miss brings it back soon", () => {
  let fact = blankFact(8, 8);
  fact = fast(fact).fact;
  fact = fast(fact).fact;
  fact = fast(fact).fact;
  const missed = applyAnswer(fact, { correct: false, elapsedMs: 700 }, NOW);
  assert.equal(missed.fact.mastered, true);
  assert.equal(missed.fact.shaky, true);
  assert.equal(missed.fact.due, NOW);

  const again = applyAnswer(missed.fact, { correct: true, elapsedMs: 800 }, NOW + 1000);
  assert.equal(again.fact.shaky, false);
  assert.equal(again.fact.mastered, true);
  assert.equal(again.fact.due, NOW + 1000 + 10 * 60 * 1000);
});

test("later quick answers on a calm square wait longer, up to three weeks", () => {
  let fact = blankFact(3, 3);
  fact = fast(fact).fact;
  fact = fast(fact).fact;
  fact = fast(fact, NOW).fact;
  assert.equal(fact.intervalMs, 24 * 60 * 60 * 1000);
  const next = applyAnswer(fact, { correct: true, elapsedMs: 500 }, NOW + fact.intervalMs);
  assert.equal(next.fact.intervalMs, 2 * 24 * 60 * 60 * 1000);

  fact.intervalMs = 20 * 24 * 60 * 60 * 1000;
  const capped = applyAnswer(fact, { correct: true, elapsedMs: 500 }, NOW);
  assert.equal(capped.fact.intervalMs, 21 * 24 * 60 * 60 * 1000);
});

test("a whole row lights together, and only the row that just finished", () => {
  let state = freshState();
  for (let b = 1; b <= 10; b += 1) {
    let fact = blankFact(4, b);
    fact = fast(fact).fact;
    fact = fast(fact).fact;
    fact = fast(fact).fact;
    state = putFact(state, fact);
  }
  assert.equal(isRowMastered(state, 4), true);
  assert.equal(isRowMastered(state, 5), false);

  let before = freshState();
  for (let b = 1; b <= 9; b += 1) {
    let fact = blankFact(4, b);
    fact = { ...fact, mastered: true, seen: 3, streak: 3 };
    before = putFact(before, fact);
  }
  const last = { ...blankFact(4, 10), mastered: true, seen: 3, streak: 3 };
  const after = putFact(before, last);
  assert.deepEqual(completedRows(before, after), [4]);
});

test("hard facts have a trick that names the real product", () => {
  assert.match(memoryTrick(7, 8), /56/);
  assert.match(memoryTrick(8, 7), /56/);
  assert.match(memoryTrick(9, 6), /fold finger 6/);
  assert.match(memoryTrick(9, 6), /54/);
  assert.match(memoryTrick(4, 7), /28/);
  assert.match(memoryTrick(6, 7), /42/);
  assert.equal(memoryTrick(2, 3), "");
  assert.equal(memoryTrick(10, 7), "");
  assert.equal(isHard(1, 9), false);

  for (let a = 1; a <= 10; a += 1) {
    for (let b = 1; b <= 10; b += 1) {
      const trick = memoryTrick(a, b);
      if (!isHard(a, b)) {
        assert.equal(trick, "");
        continue;
      }
      assert.ok(trick.length > 0, `${a}x${b} should have a trick`);
      assert.ok(trick.includes(String(a * b)), `${a}x${b} trick should name ${a * b}: ${trick}`);
    }
  }
});

test("a fresh session is short, mixed, and not the same card twice in a row", () => {
  for (let seed = 1; seed <= 6; seed += 1) {
    const queue = buildSession(freshState(), NOW, mulberry32(seed));
    assert.ok(queue.length >= 12 && queue.length <= SESSION_CARDS, `seed ${seed} length ${queue.length}`);
    const bands = new Set(queue.map((id) => {
      const [a, b] = id.split("x").map(Number);
      return difficultyBand(a, b);
    }));
    assert.equal(bands.has(0), true);
    assert.equal(bands.has(1), true);
    assert.equal(bands.has(2), true);
    for (let i = 1; i < queue.length; i += 1) {
      assert.notEqual(queue[i], queue[i - 1]);
    }
    const copies = {};
    for (const id of queue) copies[id] = (copies[id] || 0) + 1;
    for (const count of Object.values(copies)) assert.ok(count <= MASTER_STREAK);
  }
});

test("due facts come first, and a fact one quick answer from mastered is not drilled three times", () => {
  let state = freshState();
  let almost = blankFact(7, 8);
  almost = fast(almost).fact;
  almost = fast(almost).fact;
  state = putFact(state, almost);
  let missed = blankFact(6, 7);
  missed = applyAnswer(missed, { correct: false, elapsedMs: 400 }, NOW).fact;
  state = putFact(state, missed);

  const queue = buildSession(state, NOW, mulberry32(3));
  assert.ok(queue.includes("7x8"));
  assert.ok(queue.includes("6x7"));
  assert.equal(queue.filter((id) => id === "7x8").length, 1);
  assert.equal(queue.includes("8x7"), false);
});

test("a miss is inserted sooner than a slow answer, without stacking the same card", () => {
  const queue = ["1x1", "1x2", "1x3", "1x4", "1x5", "1x6"];
  const missed = requeue(queue, "9x9", 2);
  assert.equal(missed[2], "9x9");
  const slow = requeue(queue, "9x9", 5);
  assert.equal(slow[5], "9x9");
  const already = requeue(["9x9", "1x2", "1x3"], "9x9", 2);
  assert.equal(already.filter((id) => id === "9x9").length, 1);
});

test("speed picks avoid the cards just shown", () => {
  const state = freshState();
  const recent = ["1x1", "1x2", "1x3", "1x4"];
  for (let i = 0; i < 30; i += 1) {
    const id = pickSpeed(state, recent, mulberry32(i + 9));
    assert.equal(recent.includes(id), false);
    assert.ok(/^([1-9]|10)x([1-9]|10)$/.test(id));
  }
});

test("a perfect run masters every square", () => {
  let state = freshState();
  const rand = mulberry32(4);
  for (let session = 0; session < 40 && counts(state).mastered < 100; session += 1) {
    const queue = buildSession(state, NOW, rand);
    assert.ok(queue.length > 0);
    for (const id of queue) {
      const [a, b] = id.split("x").map(Number);
      const applied = fast(getFact(state, a, b));
      state = putFact(state, applied.fact);
    }
  }
  assert.equal(counts(state).mastered, 100);
});

test("speed records celebrate a higher score and ignore a zero first round", () => {
  const firstZero = recordSpeed(freshState(), 0);
  assert.equal(firstZero.first, true);
  assert.equal(firstZero.isRecord, false);
  assert.equal(firstZero.state.bestSpeed, 0);

  const first = recordSpeed(freshState(), 14);
  assert.equal(first.first, true);
  assert.equal(first.isRecord, true);
  assert.equal(first.state.bestSpeed, 14);

  const lower = recordSpeed(first.state, 9);
  assert.equal(lower.isRecord, false);
  assert.equal(lower.state.bestSpeed, 14);

  const higher = recordSpeed(lower.state, 15);
  assert.equal(higher.isRecord, true);
  assert.equal(higher.previousBest, 14);
  assert.equal(higher.state.bestSpeed, 15);
});

test("progress survives a round trip and a bad save starts clean", () => {
  let state = putFact(freshState(), fast(fast(blankFact(5, 5)).fact).fact);
  state = { ...state, bestSpeed: 12, rounds: 2 };
  const restored = hydrate(JSON.stringify(state));
  assert.equal(getFact(restored, 5, 5).streak, 2);
  assert.equal(getFact(restored, 5, 5).mastered, false);
  assert.equal(restored.bestSpeed, 12);
  assert.equal(hasProgress(restored), true);
  assert.equal(hasProgress(freshState()), false);
  assert.equal(hydrate("{").v, 1);
  assert.equal(Object.keys(hydrate("{\"v\":1,\"facts\":[]}").facts).length, 0);
  assert.equal(hydrate("{\"v\":1,\"facts\":{\"nope\":{\"seen\":3},\"__proto__\":{\"seen\":9}}}").facts["7x8"], undefined);
});
