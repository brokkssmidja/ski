import assert from "node:assert/strict";
import test from "node:test";
import {
  cupIds,
  displayName,
  ownResultRows,
  worldCupPoints,
  initials,
  markText,
  nameKey,
  personFor,
  photoUrl,
  podiumFromRelay,
  podiumFromStored,
  presentPodium,
  standingsChoices,
  standingRows,
} from "../results.js";

const levi = {
  status: "finished",
  results: [
    { rank: 1, name: "Emma AICHER", nation: "GER", time: "1:52.62", diff: "0.00", status: "finish" },
    { rank: 2, name: "Lara COLTURI", nation: "ALB", time: "1:53.05", diff: "+0.43", status: "finish" },
    { rank: 3, name: "Katharina TRUPPE", nation: "AUT", time: "1:53.12", diff: "+0.50", status: "finish" },
    { rank: 4, name: "Someone ELSE", nation: "SUI", time: "1:53.40", diff: "+0.78", status: "finish" },
  ],
};

test("names from the relay and from FIS match, and photos use the FIS picture url", () => {
  assert.equal(displayName("AICHER Emma"), "Emma Aicher");
  assert.equal(displayName("Emma AICHER"), "Emma Aicher");
  assert.equal(displayName("PINHEIRO BRAATHEN Lucas"), "Lucas Pinheiro Braathen");
  assert.equal(displayName("GUT-BEHRAMI Lara"), "Lara Gut-Behrami");
  assert.equal(displayName("MCGRATH Atle Lie"), "Atle Lie McGrath");
  assert.equal(nameKey("Emma AICHER"), nameKey("AICHER Emma"));
  assert.equal(initials("AICHER Emma"), "EA");
  assert.equal(initials("PINHEIRO BRAATHEN Lucas"), "LB");
  assert.equal(photoUrl(237841), "./photos/237841.png");
  assert.equal(photoUrl(0), "");
  assert.equal(photoUrl("nope"), "");
});

test("a finished relay podium keeps the winner's time and the gaps", () => {
  const rows = podiumFromRelay(levi);
  assert.deepEqual(rows.map((row) => row.place), [1, 2, 3]);
  assert.equal(markText(rows[0]), "1:52.62");
  assert.equal(markText(rows[1]), "+0.43");
  assert.equal(markText(rows[2]), "+0.50");
  assert.equal(podiumFromRelay({ status: "live", results: levi.results }).length, 0);
  assert.equal(podiumFromRelay({ status: "finished", results: [] }).length, 0);
});

test("photos attach when a cup list knows the skier, and a stored podium is the fallback", () => {
  const people = { [nameKey("AICHER Emma")]: { id: 237841, country: "GER" } };
  assert.equal(personFor(people, "Emma AICHER").id, 237841);
  const shown = presentPodium(podiumFromRelay(levi), [], people);
  assert.equal(shown[0].name, "Emma Aicher");
  assert.equal(shown[0].id, 237841);
  assert.equal(shown[1].id, null);
  assert.equal(shown[1].country, "ALB");

  const stored = podiumFromStored({
    results: { podium: [{ place: 1, name: "MOLTZAN Paula", country: "USA", id: 196595 }] },
  });
  const fallback = presentPodium([], stored, {});
  assert.equal(fallback[0].name, "Paula Moltzan");
  assert.equal(fallback[0].id, 196595);
  assert.equal(markText(fallback[0]), "");
});

test("a women's slalom offers the discipline cup and the overall cup", () => {
  const race = { sport: "alpine", gender: "women", discipline: "Slalom" };
  assert.deepEqual(cupIds(race), { discipline: "AL-W-SL", overall: "AL-W-ALL" });
  assert.deepEqual(cupIds({ sport: "freeski", gender: "men", discipline: "Halfpipe" }), {
    discipline: "FS-M-HP",
    overall: null,
  });
  assert.equal(cupIds({ sport: "freeski", gender: "women", discipline: "Big Air" }).overall, "FS-W-SSBA");
  assert.deepEqual(cupIds({ sport: "xc", gender: "men", discipline: "10 km Interval Start Classic" }), {
    discipline: null,
    overall: "CC-M-ALL",
  });

  const book = {
    people: {},
    cups: {
      "AL-W-SL": { label: "Slalom", rows: [{ place: 1, name: "AICHER Emma", country: "GER", points: 100, id: 237841 }] },
      "AL-W-ALL": { label: "Overall", rows: [{ place: 1, name: "MOLTZAN Paula", country: "USA", points: 180, id: 1 }] },
    },
  };
  const choices = standingsChoices(book, race);
  assert.deepEqual(choices.map((choice) => choice.label), ["Slalom", "Overall"]);
  assert.equal(standingRows(choices[0], book.people)[0].name, "Emma Aicher");
  assert.equal(standingRows(choices[0], book.people)[0].points, 100);
  assert.equal(standingsChoices({ cups: {} }, race).length, 0);
});

test("a race result uses that race's finishers and the 100-80-60 points", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 30].map(worldCupPoints), [100, 80, 60, 50, 45, 1]);
  assert.equal(worldCupPoints(31), null);
  const sprint = {
    sport: "xc",
    results: {
      places: [
        { place: 1, name: "SVAHN Linn", country: "SWE" },
        { place: 2, name: "DAHLQVIST Maja", country: "SWE" },
        { place: 5, name: "AABREKK Ingrid Bergene", country: "NOR" },
      ],
    },
  };
  const rows = ownResultRows(sprint);
  assert.deepEqual(rows.map((row) => row.name), ["SVAHN Linn", "DAHLQVIST Maja", "AABREKK Ingrid Bergene"]);
  assert.deepEqual(rows.map((row) => row.points), [100, 80, 45]);
  const distance = {
    sport: "xc",
    results: { places: [{ place: 1, name: "ANDERSSON Ebba", country: "SWE" }] },
  };
  assert.equal(ownResultRows(distance)[0].name, "ANDERSSON Ebba");
  assert.notEqual(ownResultRows(distance)[0].name, ownResultRows(sprint)[0].name);
  assert.equal(ownResultRows({ sport: "alpine", results: {} }).length, 0);
});
