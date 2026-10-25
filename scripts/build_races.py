#!/usr/bin/env python3
"""Build races.json from the official FIS calendar feeds.

Dates come from the World Cup calendar PDFs linked on
https://www.fis-ski.com/alpine-skiing/documents and
https://www.fis-ski.com/cross-country/documents.
Start times come from the FIS database iCal
(https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html).
Clock times in that feed are venue-local. They are converted to UTC with
the venue IANA zone, so the 25 Oct 2026 Europe DST fallback is applied.
Each race stores those UTC instants. `tz` is the venue zone (TBA days and
the conversion), not the zone the page displays.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "races.json"

ICAL = {
    "alpine": "https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode=2027&sectorcode=AL&categorycode=WC",
    "xc": "https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode=2027&sectorcode=CC&categorycode=WC",
    "freeski": "https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode=2027&sectorcode=FS&categorycode=WC",
}

# Raw FIS LOCATION -> (display venue, IANA zone)
PLACES = {
    "Soelden": ("Sölden", "Europe/Vienna"),
    "Levi": ("Levi", "Europe/Helsinki"),
    "Gurgl": ("Gurgl", "Europe/Vienna"),
    "Killington": ("Killington", "America/New_York"),
    "Copper Mountain, CO": ("Copper Mountain", "America/Denver"),
    "Beaver Creek": ("Beaver Creek", "America/Denver"),
    "Tremblant": ("Tremblant", "America/Toronto"),
    "Val d'Isere": ("Val d'Isère", "Europe/Paris"),
    "Val Gardena-Groeden Südtirol": ("Val Gardena", "Europe/Rome"),
    "St. Moritz": ("St. Moritz", "Europe/Zurich"),
    "Alta Badia": ("Alta Badia", "Europe/Rome"),
    "Courchevel": ("Courchevel", "Europe/Paris"),
    "Madonna di Campiglio": ("Madonna di Campiglio", "Europe/Rome"),
    "Bormio": ("Bormio", "Europe/Rome"),
    "Dachstein West / Gosau": ("Gosau", "Europe/Vienna"),
    "Kranjska Gora": ("Kranjska Gora", "Europe/Ljubljana"),
    "Flachau": ("Flachau", "Europe/Vienna"),
    "Val di Fassa": ("Val di Fassa", "Europe/Rome"),
    "Adelboden": ("Adelboden", "Europe/Zurich"),
    "Wengen": ("Wengen", "Europe/Zurich"),
    "Cortina d'Ampezzo": ("Cortina d'Ampezzo", "Europe/Rome"),
    "Kronplatz": ("Kronplatz", "Europe/Rome"),
    "Kitzbuehel": ("Kitzbühel", "Europe/Vienna"),
    "Jasna": ("Jasná", "Europe/Bratislava"),
    "Schladming": ("Schladming", "Europe/Vienna"),
    "Chamonix": ("Chamonix", "Europe/Paris"),
    "Garmisch-Partenkirchen": ("Garmisch-Partenkirchen", "Europe/Berlin"),
    "Lenzerheide": ("Lenzerheide", "Europe/Zurich"),
    "Saalbach": ("Saalbach", "Europe/Vienna"),
    "Kvitfjell": ("Kvitfjell", "Europe/Oslo"),
    "Soldeu": ("Soldeu", "Europe/Andorra"),
    "Are": ("Åre", "Europe/Stockholm"),
    "Sun Valley": ("Sun Valley", "America/Boise"),
    "Ruka": ("Ruka", "Europe/Helsinki"),
    "Trondheim": ("Trondheim", "Europe/Oslo"),
    "Davos": ("Davos", "Europe/Zurich"),
    "Les Rousses": ("Les Rousses", "Europe/Paris"),
    "Oberstdorf": ("Oberstdorf", "Europe/Berlin"),
    "Val di Fiemme": ("Val di Fiemme", "Europe/Rome"),
    "Engadin": ("Engadin", "Europe/Zurich"),
    "Toblach/Dobbiaco": ("Toblach", "Europe/Rome"),
    "Lahti": ("Lahti", "Europe/Helsinki"),
    "Oslo": ("Oslo", "Europe/Oslo"),
    "Drammen": ("Drammen", "Europe/Oslo"),
    "Ulricehamn": ("Ulricehamn", "Europe/Stockholm"),
    "Innsbruck": ("Innsbruck", "Europe/Vienna"),
    "Beijing": ("Beijing", "Asia/Shanghai"),
    "Breckenridge": ("Breckenridge", "America/Denver"),
    "Secret Garden": ("Secret Garden", "Asia/Shanghai"),
    "Copper": ("Copper Mountain", "America/Denver"),
    "Kreischberg": ("Kreischberg", "Europe/Vienna"),
    "Laax": ("Laax", "Europe/Zurich"),
    "Tignes": ("Tignes", "Europe/Paris"),
    "Calgary": ("Calgary", "America/Edmonton"),
    "Aspen": ("Aspen", "America/Denver"),
    "Silvaplana": ("Silvaplana", "Europe/Zurich"),
}

US_ALPINE = {"Killington", "Copper Mountain", "Beaver Creek", "Sun Valley"}
ALPINE_NAME = {
    "Downhill": "Downhill",
    "Super G": "Super-G",
    "Giant Slalom": "Giant Slalom",
    "Slalom": "Slalom",
}
GENDER = {"Women": "women", "Men": "men", "Mixed": "mixed"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", "replace")


def unfold(text: str) -> str:
    return re.sub(r"\r?\n[ \t]", "", text.replace("\r\n", "\n"))


def unescape(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def events(text: str) -> list[dict[str, str]]:
    out = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", unfold(text), re.S):
        item: dict[str, str] = {}
        for line in block.split("\n"):
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.split(";")[0]
            item[key] = unescape(value.strip())
        out.append(item)
    return out


def to_utc(local_date: str, hhmm: str, tz_name: str) -> str:
    hour, minute = map(int, hhmm.split(":"))
    year, month, day = map(int, local_date.split("-"))
    local = datetime(year, month, day, hour, minute, tzinfo=ZoneInfo(tz_name))
    return local.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_date_from_utc(utc_stamp: str, tz_name: str) -> str:
    dt = datetime.strptime(utc_stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(ZoneInfo(tz_name)).date().isoformat()


def watch_for(sport: str, venue: str) -> str:
    if sport == "xc":
        return "US: YouTube & Ski & Snowboard World Cup (live)."
    if venue == "Sölden":
        return "US: Peacock (live). NBCSN delay Oct 25."
    if venue in US_ALPINE:
        return "US: Peacock (live). Outside TV on demand."
    return "US: Peacock (live). YouTube after 24h."


def pretty_xc(event: str) -> str:
    name = event.replace(" Qualification", "").replace(" Final", "")
    name = re.sub(r"(\d+(?:\.\d+)?)km", r"\1 km", name)
    if name.startswith("4×5 km") or name.startswith("4x5 km"):
        return "4×5 km Mixed Relay"
    return name


def parse_alpine(ev: dict[str, str]) -> dict:
    desc = ev.get("DESCRIPTION", "")
    summary = ev.get("SUMMARY", "")
    if "Category: World Cup" not in desc:
        raise SystemExit(f"unexpected alpine category: {summary}")
    gender = GENDER[re.search(r"Gender:\s*(Women|Men|Mixed)", desc).group(1)]
    raw_event = re.search(r"Event:\s*(.+)", desc).group(1).split("\n")[0].strip()
    if raw_event not in ALPINE_NAME:
        raise SystemExit(f"unexpected alpine event {raw_event!r} in {summary}")
    location = ev["LOCATION"].strip()
    if location not in PLACES:
        raise SystemExit(f"unmapped alpine place {location!r}")
    venue, tz_name = PLACES[location]
    country = re.search(r"\(([A-Z]{3})\)", summary).group(1)
    run1 = re.search(r"Run 1 loc:\s*(\d{2}:\d{2})", desc)
    run2 = re.search(r"Run 2 loc:\s*(\d{2}:\d{2})", desc)
    if not run1:
        raise SystemExit(f"alpine race missing run 1: {summary}")
    date = local_date_from_utc(ev["DTSTART"], tz_name)
    starts = [to_utc(date, run1.group(1), tz_name)]
    if ALPINE_NAME[raw_event] in ("Giant Slalom", "Slalom"):
        if not run2:
            raise SystemExit(f"two-run race missing run 2: {summary}")
        starts.append(to_utc(date, run2.group(1), tz_name))
    elif run2:
        starts.append(to_utc(date, run2.group(1), tz_name))
    expected = ev["DTSTART"]
    got = datetime.strptime(starts[0], "%Y-%m-%dT%H:%M:%SZ").strftime("%Y%m%dT%H%M%SZ")
    if got != expected:
        raise SystemExit(
            f"UTC mismatch {venue} {raw_event} {gender}: local {run1.group(1)} {date} "
            f"{tz_name} -> {got}, FIS DTSTART {expected}"
        )
    notes = []
    if desc.startswith("Night event") or "\nNight event" in desc or desc.startswith("Night"):
        notes.append("Night")
    if "Night event" in desc.split("Category:")[0]:
        if "Night" not in notes:
            notes.append("Night")
    if venue == "Sölden":
        notes.append("Opening")
    if venue == "Sun Valley":
        notes.append("Finals")
    race_id = ev["UID"].replace("AL", "")
    race = {
        "id": f"alpine-{race_id}",
        "sport": "alpine",
        "gender": gender,
        "discipline": ALPINE_NAME[raw_event],
        "venue": venue,
        "country": country,
        "date": date,
        "tz": tz_name,
        "starts": starts,
        "watch": watch_for("alpine", venue),
        "results": {"podium": []},
    }
    if notes:
        race["note"] = " · ".join(dict.fromkeys(notes))
    return race


def parse_xc_rows(evs: list[dict[str, str]]) -> list[dict]:
    grouped: dict[tuple, dict] = {}
    for ev in evs:
        desc = ev.get("DESCRIPTION", "")
        summary = ev.get("SUMMARY", "")
        if "Overall Standings" in summary or "Overall Standings" in desc:
            continue
        if "World Cup" not in desc:
            raise SystemExit(f"unexpected xc category: {summary}")
        gender = GENDER[re.search(r"Gender:\s*(Women|Men|Mixed)", desc).group(1)]
        raw_event = re.search(r"Event:\s*(.+)", desc).group(1).split("\n")[0].strip()
        location = ev["LOCATION"].strip()
        if location not in PLACES:
            raise SystemExit(f"unmapped xc place {location!r}")
        venue, tz_name = PLACES[location]
        country = re.search(r"\(([A-Z]{3})\)", summary).group(1)
        stamp = ev["DTSTART"]
        if not re.fullmatch(r"\d{8}", stamp):
            raise SystemExit(f"expected a date-only xc start, got {stamp} for {summary}")
        date = f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}"
        base = raw_event.replace(" Qualification", "").replace(" Final", "")
        key = (date, location, gender, base)
        row = grouped.get(key)
        prefer = "Qualification" not in raw_event
        if row is None or (prefer and not row["prefer"]):
            grouped[key] = {
                "prefer": prefer,
                "uid": ev["UID"].replace("CC", ""),
                "gender": gender,
                "discipline": pretty_xc(base),
                "venue": venue,
                "country": country,
                "date": date,
                "tz": tz_name,
                "stage": "Stage World Cup" in desc,
                "mass_engadin": venue == "Engadin" and "Mass Start" in base,
            }
    races = []
    for row in grouped.values():
        notes = []
        if row["stage"]:
            notes.append("Tour de Ski")
        if row["mass_engadin"]:
            notes.append("St. Moritz–Surlej")
        race = {
            "id": f"xc-{row['uid']}",
            "sport": "xc",
            "gender": row["gender"],
            "discipline": row["discipline"],
            "venue": row["venue"],
            "country": row["country"],
            "date": row["date"],
            "tz": row["tz"],
            "starts": [None],
            "watch": watch_for("xc", row["venue"]),
            "results": {"podium": []},
        }
        if notes:
            race["note"] = " · ".join(notes)
        races.append(race)
    return races


FREESKI_EVENT = {
    "Freeski Halfpipe": "Halfpipe",
    "Freeski Slopestyle": "Slopestyle",
    "Freeski Big Air": "Big Air",
}


def parse_freeski(ev: dict[str, str]) -> dict | None:
    """Halfpipe, slopestyle, and big air only. Qualification is its own FIS race."""
    desc = ev.get("DESCRIPTION", "")
    summary = ev.get("SUMMARY", "")
    if "Category: World Cup" not in desc:
        return None
    found = re.search(r"Event:\s*(.+)", desc)
    if not found:
        return None
    raw_event = found.group(1).split("\n")[0].strip()
    qualification = raw_event.endswith(" Qualification")
    base = raw_event.replace(" Qualification", "")
    if base not in FREESKI_EVENT:
        return None
    gender = GENDER[re.search(r"Gender:\s*(Women|Men|Mixed)", desc).group(1)]
    location = ev["LOCATION"].strip()
    if location not in PLACES:
        raise SystemExit(f"unmapped freeski place {location!r}")
    venue, tz_name = PLACES[location]
    country = re.search(r"\(([A-Z]{3})\)", summary).group(1)
    run1 = re.search(r"Run 1 loc:\s*(\d{2}:\d{2})", desc)
    stamp = ev["DTSTART"]
    if run1:
        if "T" not in stamp:
            raise SystemExit(f"timed freeski missing a UTC start: {summary}")
        date = local_date_from_utc(stamp, tz_name)
        starts = [to_utc(date, run1.group(1), tz_name)]
        got = datetime.strptime(starts[0], "%Y-%m-%dT%H:%M:%SZ").strftime("%Y%m%dT%H%M%SZ")
        if got != stamp:
            raise SystemExit(
                f"UTC mismatch {venue} {raw_event} {gender}: local {run1.group(1)} {date} "
                f"{tz_name} -> {got}, FIS DTSTART {stamp}"
            )
    else:
        if not re.fullmatch(r"\d{8}", stamp):
            raise SystemExit(f"expected a date-only freeski start, got {stamp} for {summary}")
        date = f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}"
        starts = [None]
    discipline = FREESKI_EVENT[base] + (" Qualification" if qualification else "")
    return {
        "id": f"freeski-{ev['UID'].replace('FS', '')}",
        "sport": "freeski",
        "gender": gender,
        "discipline": discipline,
        "venue": venue,
        "country": country,
        "date": date,
        "tz": tz_name,
        "starts": starts,
        "watch": "",
        "results": {"podium": []},
    }


def fetch_codex(race_id: str) -> int:
    number = race_id.split("-", 1)[1]
    url = f"https://www.fis-ski.com/DB/general/results.html?sectorcode=FS&raceid={number}"
    match = re.search(r'"competitionCodex"\s*:\s*(\d+)', fetch(url))
    if not match:
        raise SystemExit(f"no freeski codex for {race_id}")
    codex = int(match.group(1))
    if not 0 <= codex <= 9999:
        raise SystemExit(f"freeski codex out of range for {race_id}: {codex}")
    return codex


def narvik() -> list[dict]:
    """On the women's calendar PDF, not yet a timed row in the FIS database."""
    races = []
    for date, discipline, slug in (
        ("2027-03-12", "Downhill", "dh"),
        ("2027-03-13", "Super-G", "sg"),
    ):
        races.append(
            {
                "id": f"alpine-narvik-2027{date[5:7]}{date[8:10]}-{slug}",
                "sport": "alpine",
                "gender": "women",
                "discipline": discipline,
                "venue": "Narvik",
                "country": "NOR",
                "date": date,
                "tz": "Europe/Oslo",
                "starts": [None],
                "watch": watch_for("alpine", "Narvik"),
                "results": {"podium": []},
                "note": "Venue TBC",
            }
        )
    return races


def remembered() -> tuple[dict[str, int], dict[str, list]]:
    """Keep codex and podiums already stored. A rebuild does not refetch them."""
    if not OUT.exists():
        return {}, {}
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, {}
    codex: dict[str, int] = {}
    podiums: dict[str, list] = {}
    for race in old.get("races", []):
        number = race.get("codex")
        if isinstance(number, int) and 0 <= number <= 9999:
            codex[race["id"]] = number
        podium = race.get("results", {}).get("podium")
        if isinstance(podium, list) and podium:
            podiums[race["id"]] = podium
    return codex, podiums


def with_memory(race: dict, codex: dict[str, int], podiums: dict[str, list]) -> dict:
    out: dict = {}
    for key, value in race.items():
        out[key] = value
        if key == "id" and race["id"] in codex:
            out["codex"] = codex[race["id"]]
    if race["id"] in podiums:
        out["results"] = {"podium": podiums[race["id"]]}
    return out


def sort_key(race: dict) -> tuple:
    gender_order = {"women": 0, "men": 1, "mixed": 2}
    first = next((s for s in race["starts"] if s), "9999")
    return (race["date"], first, gender_order[race["gender"]], race["sport"], race["discipline"], race["id"])


def main() -> None:
    alpine = [parse_alpine(ev) for ev in events(fetch(ICAL["alpine"]))]
    xc = parse_xc_rows(events(fetch(ICAL["xc"])))
    freeski = [race for race in (parse_freeski(ev) for ev in events(fetch(ICAL["freeski"]))) if race]
    codex, podiums = remembered()
    missing = [race["id"] for race in freeski if race["id"] not in codex]
    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(fetch_codex, race_id): race_id for race_id in missing}
            for future in as_completed(futures):
                codex[futures[future]] = future.result()
    races = [with_memory(race, codex, podiums) for race in alpine + xc + freeski + narvik()]
    races.sort(key=sort_key)
    ids = [r["id"] for r in races]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate race ids")

    def count(sport, gender=None):
        return sum(1 for r in races if r["sport"] == sport and (gender is None or r["gender"] == gender))

    men = count("alpine", "men")
    women = count("alpine", "women")
    if men != 43 or women != 40:
        raise SystemExit(f"alpine counts men={men} women={women}, expected 43 and 40")

    by_disc: dict[tuple, int] = {}
    for r in races:
        if r["sport"] != "alpine":
            continue
        by_disc[(r["gender"], r["discipline"])] = by_disc.get((r["gender"], r["discipline"]), 0) + 1
    expected = {
        ("men", "Downhill"): 10,
        ("men", "Super-G"): 10,
        ("men", "Giant Slalom"): 10,
        ("men", "Slalom"): 13,
        ("women", "Downhill"): 9,
        ("women", "Super-G"): 9,
        ("women", "Giant Slalom"): 12,
        ("women", "Slalom"): 10,
    }
    if by_disc != expected:
        raise SystemExit(f"discipline counts {by_disc} != {expected}")

    freeski_rows = [r for r in races if r["sport"] == "freeski"]
    if len(freeski_rows) != 52:
        raise SystemExit(f"freeski count {len(freeski_rows)}, expected 52")
    fs_disc: dict[tuple, int] = {}
    fs_codex: set[int] = set()
    timed = 0
    for race in freeski_rows:
        fs_disc[(race["gender"], race["discipline"])] = fs_disc.get((race["gender"], race["discipline"]), 0) + 1
        if not isinstance(race.get("codex"), int):
            raise SystemExit(f"freeski missing codex: {race['id']}")
        if race["codex"] in fs_codex:
            raise SystemExit(f"duplicate freeski codex {race['codex']}")
        fs_codex.add(race["codex"])
        if any(race["starts"]):
            timed += 1
    fs_expected = {}
    for gender in ("women", "men"):
        fs_expected[(gender, "Halfpipe")] = 5
        fs_expected[(gender, "Halfpipe Qualification")] = 5
        fs_expected[(gender, "Slopestyle")] = 4
        fs_expected[(gender, "Slopestyle Qualification")] = 4
        fs_expected[(gender, "Big Air")] = 4
        fs_expected[(gender, "Big Air Qualification")] = 4
    if fs_disc != fs_expected:
        raise SystemExit(f"freeski disciplines {fs_disc} != {fs_expected}")
    if timed != 2:
        raise SystemExit(f"expected 2 timed freeski finals, got {timed}")

    tba = [r for r in races if any(s is None for s in r["starts"])]
    payload = {
        "season": "2026/27",
        "sources": {
            "alpineCalendar": "https://www.fis-ski.com/alpine-skiing/documents",
            "alpineCalendarPdfWomen": "https://assets.fis-ski.com/f/252177/x/fbd04e5924/2627women_17-07-2026.pdf",
            "alpineCalendarPdfMen": "https://assets.fis-ski.com/f/252177/x/dbc6f072ae/2627men_13-01-2026.pdf",
            "xcCalendar": "https://www.fis-ski.com/cross-country/documents",
            "xcCalendarPdf": "https://assets.fis-ski.com/f/252177/x/d9032a8e11/draft_formats_wc_calendar_cc_2026-27.pdf",
            "freeskiCalendar": "https://www.fis-ski.com/DB/freestyle-freeski/freeski/calendar-results.html?sectorcode=FS&seasoncode=2027&categorycode=WC&disciplinecode=HP,SS,BA&seasonmonth=X-2027",
            "times": "FIS database iCal, season 2027, category WC, sectors AL, CC, and FS",
            "live": (
                "FIS live timing. Alpine: https://live.fis-ski.com/lv-al{codex}.htm. "
                "Cross-country: https://live.fis-ski.com/cc-{codex}/results-pda.htm. "
                "Freeski: https://live.fis-ski.com/lv-fss{codex}.htm. "
                "Codex is competitionCodex on the FIS results page."
            ),
        },
        "races": races,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} races={len(races)}")
    print(f"alpine men={men} women={women} xc={count('xc')} mixed={count('xc','mixed')} freeski={count('freeski')}")
    print(f"tba={len(tba)} range={races[0]['date']}..{races[-1]['date']}")
    solden = [r for r in races if r["venue"] == "Sölden"]
    for r in solden:
        print(r["gender"], r["starts"], r["date"])


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as exc:
        sys.exit(f"FIS download failed: {exc}")
