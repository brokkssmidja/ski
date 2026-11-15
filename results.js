/**
 * Podium and World Cup cup rows for a finished race.
 * Times come from the timing relay. Photos and cup points come from a same-origin
 * snapshot of the FIS pages, because those pages only allow the FIS site to read them.
 */

const SECTOR = { alpine: "AL", xc: "CC", freeski: "FS" };
const GENDER_CODE = { women: "W", men: "M" };

const DISCIPLINE = {
  alpine: { Slalom: "SL", "Giant Slalom": "GS", "Super-G": "SG", Downhill: "DH" },
  xc: {},
  freeski: {
    Halfpipe: "HP",
    "Halfpipe Qualification": "HP",
    Slopestyle: "SS",
    "Slopestyle Qualification": "SS",
    "Big Air": "BA",
    "Big Air Qualification": "BA",
  },
};

/** Freeski has no overall list. Slopestyle and big air share one combined cup. */
const FREESKI_COMBINED = new Set(["SS", "BA"]);

export function photoUrl(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return "";
  // FIS serves the headshot as image/png, but Chrome blocks that cross-origin
  // response (ORB) because the URL is not a public image endpoint. The cup
  // build saves a copy next to the page.
  return `./photos/${n}.png`;
}

function titleWord(word) {
  return String(word)
    .split("-")
    .map((part) => {
      if (!part) return part;
      const lower = part.toLowerCase();
      if (lower.startsWith("mc") && lower.length > 2) {
        return `Mc${lower[2].toUpperCase()}${lower.slice(3)}`;
      }
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("-");
}

function surnameWord(word) {
  return word.length > 1 && /^[A-Z0-9][A-Z0-9'’.`-]*$/.test(word);
}

/** "AICHER Emma" and "Emma AICHER" both become "Emma Aicher". */
export function displayName(name) {
  const parts = String(name || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!parts.length) return "";
  if (surnameWord(parts[0])) {
    let index = 0;
    while (index < parts.length - 1 && surnameWord(parts[index])) index += 1;
    if (index > 0 && index < parts.length) {
      const given = parts.slice(index).map(titleWord).join(" ");
      const family = parts.slice(0, index).map(titleWord).join(" ");
      return `${given} ${family}`.trim();
    }
  }
  return parts.map(titleWord).join(" ");
}

export function nameKey(name) {
  return displayName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function initials(name) {
  const parts = displayName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function personFor(people, name) {
  if (!people || typeof people !== "object") return null;
  return people[nameKey(name)] || null;
}

/** Winner shows the total. The others show the gap when the feed has one. */
export function markText(row) {
  if (!row) return "";
  if (Number(row.place) === 1 && row.time) return String(row.time);
  if (row.diff) return String(row.diff);
  return row.time ? String(row.time) : "";
}

export function podiumFromRelay(payload) {
  if (!payload || payload.status !== "finished" || !Array.isArray(payload.results)) return [];
  return payload.results
    .filter((row) => row && row.status === "finish" && Number(row.rank) >= 1 && Number(row.rank) <= 3)
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .slice(0, 3)
    .map((row) => ({
      place: Number(row.rank),
      name: row.name || "",
      country: row.nation || "",
      time: row.time || "",
      diff: Number(row.rank) === 1 ? "" : (row.diff || ""),
    }));
}

export function podiumFromStored(race) {
  const rows = race?.results?.podium;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && Number(row.place) >= 1)
    .sort((a, b) => Number(a.place) - Number(b.place))
    .slice(0, 3)
    .map((row) => ({
      place: Number(row.place),
      name: row.name || "",
      country: row.country || row.nation || "",
      time: row.time || "",
      diff: row.diff || "",
      id: row.id || null,
    }));
}

/** Prefer the relay, which has times. Keep a stored FIS id when the name matches. */
export function presentPodium(relayRows, storedRows, people) {
  const base = relayRows?.length ? relayRows : (storedRows || []);
  return base.slice(0, 3).map((row) => {
    const known = personFor(people, row.name);
    const stored = (storedRows || []).find((item) => Number(item.place) === Number(row.place));
    const id = row.id || known?.id || stored?.id || null;
    return {
      place: Number(row.place),
      name: displayName(row.name),
      country: row.country || known?.country || "",
      time: row.time || "",
      diff: row.diff || "",
      id: id || null,
    };
  });
}

export function cupIds(race) {
  const sector = SECTOR[race?.sport];
  const gender = GENDER_CODE[race?.gender];
  if (!sector || !gender) return { discipline: null, overall: null };
  const code = DISCIPLINE[race.sport]?.[race.discipline] || "";
  const discipline = code ? `${sector}-${gender}-${code}` : null;
  let overall = null;
  if (race.sport === "freeski") {
    overall = code && FREESKI_COMBINED.has(code) ? `${sector}-${gender}-SSBA` : null;
  } else if (code !== "ALL") {
    overall = `${sector}-${gender}-ALL`;
  }
  if (overall === discipline) overall = null;
  return { discipline, overall };
}

export function standingsChoices(book, race) {
  const cups = book?.cups;
  if (!cups) return [];
  const ids = cupIds(race);
  const choices = [];
  const discipline = ids.discipline && cups[ids.discipline];
  const overall = ids.overall && cups[ids.overall];
  if (discipline?.rows?.length) choices.push({ id: "discipline", label: discipline.label || "Discipline", rows: discipline.rows.slice(0, 5) });
  if (overall?.rows?.length) choices.push({ id: "overall", label: overall.label || "Overall", rows: overall.rows.slice(0, 5) });
  return choices;
}

export function standingRows(choice, people) {
  if (!choice?.rows) return [];
  return choice.rows.slice(0, 5).map((row) => {
    const known = personFor(people, row.name);
    return {
      place: Number(row.place),
      name: displayName(row.name),
      country: row.country || known?.country || "",
      points: row.points,
      id: row.id || known?.id || null,
    };
  });
}
