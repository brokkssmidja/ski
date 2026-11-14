#!/usr/bin/env python3
"""Save the top of each World Cup list for the static site.

FIS cup pages send Access-Control-Allow-Origin: https://www.fis-ski.com, so a
page on GitHub Pages cannot read them. This script copies the top five, plus
enough names to match podium photos, into cups.json. Photos themselves are
loaded later as images and do not need that header.
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cups.json"
SEASON = "2027"
TOP = 5
PEOPLE = 40

PAGES = {
    "AL": "https://www.fis-ski.com/DB/alpine-skiing/cup-standings.html",
    "CC": "https://www.fis-ski.com/DB/cross-country/cup-standings.html",
    "FS": "https://www.fis-ski.com/DB/freestyle-freeski/freeski/cup-standings.html",
}
LISTS = {
    "AL": [("SL", "Slalom"), ("GS", "Giant Slalom"), ("SG", "Super-G"), ("DH", "Downhill"), ("ALL", "Overall")],
    "CC": [("ALL", "Overall")],
    "FS": [("HP", "Halfpipe"), ("SS", "Slopestyle"), ("BA", "Big Air"), ("SSBA", "Slopestyle & Big Air")],
}
GENDERS = ("W", "M")


def clean(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


def selected(html: str, select_id: str) -> str | None:
    block = re.search(rf'id="{select_id}".*?</select>', html, re.S)
    if not block:
        return None
    match = re.search(r'<option value="([^"]*)" selected', block.group(0))
    return match.group(1) if match else None


def parse_rows(html: str) -> list[dict]:
    rows = []
    for part in html.split('class="table-row')[1:]:
        name = re.search(r'align-xs-top">\s*(.*?)\s*</div>', part, re.S)
        ident = re.search(r"competitorid=(\d+)", part)
        nation = re.search(r"country__name-short\">([A-Z]{3})", part)
        numbers = re.findall(r'justify-right bold">\s*([0-9]+(?:\.[0-9]+)?)', part)
        if not (name and ident and nation and len(numbers) >= 2):
            continue
        place = int(float(numbers[0]))
        points = float(numbers[1]) if "." in numbers[1] else int(numbers[1])
        if place < 1:
            continue
        rows.append(
            {
                "place": place,
                "name": clean(name.group(1)),
                "country": nation.group(1),
                "points": points,
                "id": int(ident.group(1)),
            }
        )
    rows.sort(key=lambda row: row["place"])
    return rows


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 world-cup-schedule"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def save_photo(athlete_id: int, folder: Path) -> None:
    dest = folder / f"{athlete_id}.png"
    url = f"https://www.fis-ski.com/DB/general/load-competitor-picture/{athlete_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 world-cup-schedule"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            kind = resp.headers.get("Content-Type", "")
    except Exception as exc:
        print(f"photo {athlete_id}: {exc}")
        return
    if not data.startswith(b"\x89PNG") or "image" not in kind:
        print(f"photo {athlete_id}: not a png")
        return
    dest.write_bytes(data)


def cup_url(sector: str, gender: str, discipline: str) -> str:
    return (
        f"{PAGES[sector]}?sectorcode={sector}&seasoncode={SEASON}"
        f"&cupcode=WC&disciplinecode={discipline}&gendercode={gender}"
    )


def name_key(name: str) -> str:
    parts = name.split()
    surname = []
    index = 0
    while index < len(parts) - 1 and parts[index].isupper() and len(parts[index]) > 1:
        surname.append(parts[index])
        index += 1
    ordered = parts[index:] + surname if surname and index < len(parts) else parts
    plain = unicodedata.normalize("NFD", "".join(ordered))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"[^A-Za-z]", "", plain).upper()


def build() -> dict:
    cups: dict[str, dict] = {}
    people: dict[str, dict] = {}
    for sector, disciplines in LISTS.items():
        for gender in GENDERS:
            for code, label in disciplines:
                key = f"{sector}-{gender}-{code}"
                url = cup_url(sector, gender, code)
                try:
                    html = fetch(url)
                except Exception as exc:
                    print(f"skip {key}: {exc}")
                    time.sleep(0.3)
                    continue
                time.sleep(0.3)
                if selected(html, "seasoncode") != SEASON or selected(html, "cupcode") != "WC":
                    print(f"skip {key}: not the {SEASON} World Cup")
                    continue
                if selected(html, "disciplinecode") != code or selected(html, "gendercode") != gender:
                    print(f"skip {key}: page showed a different list")
                    continue
                rows = parse_rows(html)
                if not rows:
                    print(f"skip {key}: no rows")
                    continue
                cups[key] = {
                    "label": label,
                    "rows": [{k: row[k] for k in ("place", "name", "country", "points", "id")} for row in rows[:TOP]],
                }
                for row in rows[:PEOPLE]:
                    ident = name_key(row["name"])
                    if ident and ident not in people:
                        people[ident] = {"id": row["id"], "country": row["country"]}
                print(f"{key}: {rows[0]['name']} {rows[0]['points']}")
    folder = ROOT / "photos"
    folder.mkdir(exist_ok=True)
    ids = {
        row["id"]
        for cup in cups.values()
        for row in cup["rows"]
        if isinstance(row.get("id"), int)
    }
    for athlete_id in sorted(ids):
        save_photo(athlete_id, folder)
        time.sleep(0.15)
    return {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "people": people,
        "cups": cups,
    }


def main() -> int:
    payload = build()
    if len(payload["cups"]) < 2:
        print(f"only {len(payload['cups'])} cups; leaving {OUT.name} unchanged")
        return 0
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(payload['cups'])} cups, {len(payload['people'])} people")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
