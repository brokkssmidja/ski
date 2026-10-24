/**
 * Swedish, American, and Norwegian skiers to watch, by discipline.
 *
 * Edit the names in this file. A race is highlighted when its sport, gender,
 * and discipline match a block below.
 *
 * Alpine `disciplines` must match the race exactly:
 *   "Slalom", "Giant Slalom", "Super-G", "Downhill"
 * Cross-country uses `kinds` instead of every distance string:
 *   "sprint"    any sprint, including team sprint
 *   "distance"  everything that is not a sprint or a relay
 *   "relay"
 * `country` is "SWE", "USA", or "NOR". `name` is what the page shows.
 *
 * The names are the top 2025/26 contenders from those three countries.
 * Delete a line to stop showing that skier.
 */

export const CONTENDERS = [
  {
    sport: "alpine",
    gender: "women",
    disciplines: ["Slalom"],
    athletes: [
      { name: "Mikaela Shiffrin", country: "USA" },
      { name: "Paula Moltzan", country: "USA" },
    ],
  },
  {
    sport: "alpine",
    gender: "women",
    disciplines: ["Giant Slalom"],
    athletes: [
      { name: "Sara Hector", country: "SWE" },
      { name: "Mikaela Shiffrin", country: "USA" },
      { name: "Paula Moltzan", country: "USA" },
      { name: "Mina Fürst Holtmann", country: "NOR" },
    ],
  },
  {
    sport: "alpine",
    gender: "women",
    disciplines: ["Downhill"],
    athletes: [
      { name: "Breezy Johnson", country: "USA" },
      { name: "Lindsey Vonn", country: "USA" },
      { name: "Kajsa Vickhoff Lie", country: "NOR" },
    ],
  },
  {
    sport: "alpine",
    gender: "women",
    disciplines: ["Super-G"],
    athletes: [
      { name: "Breezy Johnson", country: "USA" },
      { name: "Lindsey Vonn", country: "USA" },
      { name: "Kajsa Vickhoff Lie", country: "NOR" },
    ],
  },
  {
    sport: "alpine",
    gender: "men",
    disciplines: ["Slalom"],
    athletes: [
      { name: "Henrik Kristoffersen", country: "NOR" },
      { name: "Atle Lie McGrath", country: "NOR" },
      { name: "Timon Haugan", country: "NOR" },
    ],
  },
  {
    sport: "alpine",
    gender: "men",
    disciplines: ["Giant Slalom"],
    athletes: [
      { name: "Henrik Kristoffersen", country: "NOR" },
      { name: "Atle Lie McGrath", country: "NOR" },
    ],
  },
  {
    sport: "alpine",
    gender: "men",
    disciplines: ["Downhill", "Super-G"],
    athletes: [
      { name: "Ryan Cochran-Siegle", country: "USA" },
    ],
  },
  {
    sport: "xc",
    gender: "men",
    kinds: ["sprint"],
    athletes: [
      { name: "Johannes Høsflot Klæbo", country: "NOR" },
      { name: "Ben Ogden", country: "USA" },
    ],
  },
  {
    sport: "xc",
    gender: "men",
    kinds: ["distance"],
    athletes: [
      { name: "Johannes Høsflot Klæbo", country: "NOR" },
      { name: "Harald Østberg Amundsen", country: "NOR" },
      { name: "Gus Schumacher", country: "USA" },
    ],
  },
  {
    sport: "xc",
    gender: "women",
    kinds: ["sprint"],
    athletes: [
      { name: "Maja Dahlqvist", country: "SWE" },
      { name: "Johanna Hagström", country: "SWE" },
      { name: "Jonna Sundling", country: "SWE" },
      { name: "Linn Svahn", country: "SWE" },
      { name: "Kristine Stavås Skistad", country: "NOR" },
    ],
  },
  {
    sport: "xc",
    gender: "women",
    kinds: ["distance"],
    athletes: [
      { name: "Frida Karlsson", country: "SWE" },
      { name: "Moa Ilar", country: "SWE" },
      { name: "Jessie Diggins", country: "USA" },
      { name: "Heidi Weng", country: "NOR" },
    ],
  },
  {
    sport: "xc",
    gender: "mixed",
    kinds: ["relay"],
    athletes: [
      { name: "Frida Karlsson", country: "SWE" },
      { name: "Jessie Diggins", country: "USA" },
      { name: "Johannes Høsflot Klæbo", country: "NOR" },
    ],
  },
];

const COUNTRY_ORDER = ["SWE", "USA", "NOR"];
const CODES = { SWE: "SE", USA: "US", NOR: "NO" };

export function disciplineKind(race) {
  if (race.sport !== "xc") return race.discipline;
  if (/sprint/i.test(race.discipline)) return "sprint";
  if (/relay/i.test(race.discipline)) return "relay";
  return "distance";
}

export function contendersFor(race, groups = CONTENDERS) {
  const kind = disciplineKind(race);
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    if (group.sport !== race.sport || group.gender !== race.gender) continue;
    const hit = group.disciplines?.includes(race.discipline) || group.kinds?.includes(kind);
    if (!hit) continue;
    for (const athlete of group.athletes) {
      const key = `${athlete.country}:${athlete.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(athlete);
    }
  }
  return out;
}

/** Badges in SE, US, NO order. Names stay in file order inside each country. */
export function contendersByCountry(race, groups = CONTENDERS) {
  const list = contendersFor(race, groups);
  return COUNTRY_ORDER
    .map((country) => ({
      country,
      code: CODES[country],
      names: list.filter((athlete) => athlete.country === country).map((athlete) => athlete.name),
    }))
    .filter((row) => row.names.length);
}
