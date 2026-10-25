#!/usr/bin/env python3
"""Fill empty podiums in races.json from official FIS results pages.

A result is stored only when the page is an official result valid for FIS
points, the podium cards list 1st–3rd, and those names match the results table.
Existing podiums are left alone. Nothing else in the file is edited.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RACES = ROOT / "races.json"
NAME_RE = re.compile(r"(?u)[\w .''’\-]{2,80}\Z")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_podium(html: str):
    title = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    if not title:
        return None
    heading = clean(re.sub(r"<[^>]+>", " ", title.group(1)))
    if "Results" not in heading or "Start List" in heading:
        return None
    if "official results" not in html.lower():
        return None
    if "Valid for FIS Points: YES" not in html:
        return None

    cards = []
    for block in re.findall(r'class="podium-item\b.*?</a>', html, re.S):
        rank = re.search(r'result-card__rank">\s*(\d)', block)
        name = re.search(r'result-card__name">\s*(.*?)\s*(?:<!--|<)', block, re.S)
        flag = re.search(r"flag-([A-Z]{3})\b", block)
        if not (rank and name and flag):
            continue
        cards.append(
            {"place": int(rank.group(1)), "name": clean(name.group(1)), "country": flag.group(1)}
        )
    by_card = {c["place"]: c for c in cards if c["place"] in (1, 2, 3)}
    if set(by_card) != {1, 2, 3}:
        return None

    marker = 'id="events-info-results"'
    if marker not in html:
        return None
    chunk = html.split(marker, 1)[1][:250000]
    rows = []
    for part in chunk.split('class="table-row"')[1:4]:
        rank = re.search(r'justify-right pr-1 bold">\s*(\d+)', part)
        name = re.search(r'athlete-name">\s*(.*?)\s*</div>', part, re.S)
        if not name:
            name = re.search(r'justify-left bold">\s*([^<]*?)\s*</div>', part, re.S)
        country = re.search(r'country__name-short">([A-Z]{3})', part)
        if not (rank and name and country):
            return None
        rows.append(
            {"place": int(rank.group(1)), "name": clean(name.group(1)), "country": country.group(1)}
        )
    if [row["place"] for row in rows] != [1, 2, 3]:
        return None
    for row in rows:
        card = by_card[row["place"]]
        if card["name"] != row["name"] or card["country"] != row["country"]:
            return None
        if not NAME_RE.fullmatch(row["name"]):
            return None
    return [by_card[i] for i in (1, 2, 3)]


def race_url(race: dict) -> str | None:
    match = re.fullmatch(r"(alpine|xc|freeski)-(\d+)", race["id"])
    if not match:
        return None
    sector = {"alpine": "AL", "xc": "CC", "freeski": "FS"}[match.group(1)]
    return (
        "https://www.fis-ski.com/DB/general/results.html"
        f"?sectorcode={sector}&raceid={match.group(2)}"
    )


def parse_start(stamp: str) -> datetime:
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def finish_delay(race: dict, starts: list[str]) -> timedelta:
    if race.get("sport") == "freeski":
        return timedelta(hours=4)
    if race.get("sport") == "xc":
        return timedelta(minutes=90)
    if race.get("discipline") in ("Slalom", "Giant Slalom") and len(starts) >= 2:
        return timedelta(minutes=75)
    return timedelta(hours=2)


def ready(race: dict, now: datetime, sweep: bool = False) -> bool:
    if race.get("results", {}).get("podium"):
        return False
    times = [s for s in race.get("starts") or [] if s]
    if times:
        first = parse_start(times[0])
        if now < first:
            return False
        if sweep:
            return True
        last = parse_start(times[-1])
        return now <= last + finish_delay(race, times) + timedelta(hours=6)
    if sweep:
        return race["date"] <= (now.date() + timedelta(days=1)).isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    return race["date"] in (now.date().isoformat(), yesterday)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 world-cup-schedule"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "--self-test":
        podium = parse_podium(Path(sys.argv[2]).read_text(encoding="utf-8"))
        if not podium or [p["name"] for p in podium] != [
            "SCHEIB Julia",
            "MOLTZAN Paula",
            "GUT-BEHRAMI Lara",
        ]:
            raise SystemExit(f"self-test failed: {podium}")
        print("self-test ok")
        return 0

    payload = json.loads(RACES.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    sweep = "--sweep" in sys.argv
    changed = 0
    checked = 0
    for race in payload["races"]:
        if changed >= 25 or checked >= 40:
            break
        url = race_url(race)
        if not url or not ready(race, now, sweep):
            continue
        checked += 1
        try:
            podium = parse_podium(fetch(url))
        except Exception as exc:
            print(f"skip {race['id']}: {exc}", file=sys.stderr)
            time.sleep(0.4)
            continue
        time.sleep(0.4)
        if not podium:
            print(f"no official podium {race['id']}")
            continue
        race["results"] = {"podium": podium}
        changed += 1
        print(f"podium {race['id']}: {podium[0]['name']}")
    if changed:
        RACES.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"checked={checked} updated={changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
