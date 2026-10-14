"""
Convert Redan's station spreadsheet into src/data/stations.json.

    npm run import:stations
    python scripts/import_stations.py ["path/to/Station Details.xlsx"] [output.json]

Default input: data-sources/Station Details.xlsx

Uses only the Python standard library (an .xlsx file is a zip of XML), so
there is nothing to pip install.

Columns are found by their header text, so their order does not matter.
Required: STATION NAME, TOWN, OPERATING HOURS, CONTACT, PRODUCTS.
Optional, picked up automatically when added later:
  SITE MANAGER, LANDLINE (used only when a station has no cell number),
  ADDRESS, LATITUDE, LONGITUDE, MAPS LINK (a Google Maps link),
  OPEN FROM / OPEN TO (e.g. 06:00 / 18:00, for 12-hour stations).
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "data-sources" / "Station Details.xlsx"
OUTPUT = ROOT / "src" / "data" / "stations.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

# Extra spellings customers might type, so a search still finds the station.
ALIASES = {
    "Belevue": ["Bellevue"],
    "Umwingisdale": ["Umwinsidale"],
    "Gweru Main Street": ["Gweru Mainstreet"],
    "Masvingo Clipsham": ["Clipsham"],
    "Masvingo Pangolin": ["Pangolin"],
}


def read_first_sheet(path: Path) -> list[list[str]]:
    """Return the first worksheet as a list of rows of cell text."""
    z = zipfile.ZipFile(path)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}
    first = wb.find("m:sheets", NS)[0]
    target = targets[first.get(f"{{{NS['r']}}}id")].lstrip("/")
    if not target.startswith("xl/"):
        target = "xl/" + target

    def col_index(ref: str) -> int:
        n = 0
        for ch in re.match(r"[A-Z]+", ref).group():
            n = n * 26 + ord(ch) - 64
        return n - 1

    rows: list[list[str]] = []
    for row in ET.fromstring(z.read(target)).iter(f"{{{NS['m']}}}row"):
        cells: dict[int, str] = {}
        for c in row.findall("m:c", NS):
            t = c.get("t")
            v = c.find("m:v", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
            else:
                val = v.text if v is not None and v.text else ""
            cells[col_index(c.get("r"))] = val.strip()
        if any(cells.values()):
            width = max(cells) + 1
            rows.append([cells.get(i, "") for i in range(width)])
    return rows


def format_phone(raw: str) -> str | None:
    """'773673140' -> '0773 673 140'. Excel drops the leading zero."""
    raw = re.sub(r"\.0$", "", raw.strip())  # numeric cells can read as '773673140.0'
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("263"):
        digits = "0" + digits[3:]
    if len(digits) == 9:
        digits = "0" + digits
    if len(digits) == 10:
        return f"{digits[:4]} {digits[4:7]} {digits[7:]}"
    return digits


def is_cell(phone: str | None) -> bool:
    """Zimbabwe mobile numbers start 07 (e.g. 0773 ..., 0717 ...)."""
    return bool(phone) and re.sub(r"\D", "", phone).startswith("07")


def coords_from_link(link: str) -> tuple[float, float] | None:
    """Pull lat,lng out of a full Google Maps link, if it contains them."""
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", link) or re.search(
        r"[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)", link
    )
    return (float(m.group(1)), float(m.group(2))) if m else None


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else OUTPUT
    if not src.exists():
        sys.exit(f"Station file not found: {src}")

    rows = read_first_sheet(src)
    header_at = next(
        (i for i, r in enumerate(rows) if any("STATION NAME" in c.upper() for c in r)),
        None,
    )
    if header_at is None:
        sys.exit("No 'STATION NAME' header row found.")

    header = [c.upper().strip() for c in rows[header_at]]

    def col(*names: str) -> int | None:
        for name in names:
            for i, h in enumerate(header):
                if h == name:
                    return i
        return None

    c_name = col("STATION NAME")
    c_town = col("TOWN", "CITY")
    c_hours = col("OPERATING HOURS", "HOURS")
    c_phone = col("CONTACT", "PHONE")
    c_products = col("PRODUCTS")
    c_manager = col("SITE MANAGER", "MANAGER")
    c_landline = col("LANDLINE", "TELEPHONE", "TEL")
    c_address = col("ADDRESS")
    c_lat = col("LATITUDE", "LAT")
    c_lng = col("LONGITUDE", "LNG", "LONG")
    c_link = col("MAPS LINK", "GOOGLE MAPS", "LOCATION")
    c_from = col("OPEN FROM")
    c_to = col("OPEN TO")
    missing = [n for n, c in [("STATION NAME", c_name), ("TOWN", c_town),
               ("OPERATING HOURS", c_hours), ("CONTACT", c_phone),
               ("PRODUCTS", c_products)] if c is None]
    if missing:
        sys.exit(f"Missing required column(s): {', '.join(missing)}")

    def cell(r: list[str], i: int | None) -> str:
        return r[i].strip() if i is not None and i < len(r) else ""

    stations, warnings, seen_ids = [], [], set()
    for r in rows[header_at + 1:]:
        name = cell(r, c_name)
        if not name:
            continue
        town = cell(r, c_town)
        hours_raw = cell(r, c_hours).lower()
        products = {p.strip().lower() for p in cell(r, c_products).split(",")}

        hours = "12h" if hours_raw.startswith("12") else "24h"
        if not hours_raw.startswith(("12", "24")):
            warnings.append(f"{name}: unrecognised hours '{cell(r, c_hours)}', assumed 24h")
        open_from = cell(r, c_from) or None
        open_to = cell(r, c_to) or None
        if hours == "12h" and not (open_from and open_to):
            warnings.append(f"{name}: 12-hour station with no OPEN FROM / OPEN TO times")

        lat = lng = None
        link = cell(r, c_link) or None
        if cell(r, c_lat) and cell(r, c_lng):
            lat, lng = float(cell(r, c_lat)), float(cell(r, c_lng))
        elif link and (ll := coords_from_link(link)):
            lat, lng = ll

        contact = format_phone(cell(r, c_phone))
        extra = format_phone(cell(r, c_landline))
        cell_no = next((p for p in (contact, extra) if is_cell(p)), None)
        landline = next((p for p in (contact, extra) if p and not is_cell(p)), None)
        if contact and not is_cell(contact):
            warnings.append(f"{name}: CONTACT {contact} is not a cell number")

        sid = slug(f"{town}-{name}")
        while sid in seen_ids:
            sid += "-2"
        seen_ids.add(sid)

        display = name if name.lower().startswith("redan") else f"Redan {name}"
        stations.append({
            "id": sid,
            "name": display,
            "aliases": ALIASES.get(name, []),
            "city": town,
            "address": cell(r, c_address) or None,
            # The site's cell number is the contact; a landline is kept only
            # as a fallback for stations with no cell number.
            "phone": cell_no,
            "landline": None if cell_no else landline,
            "manager": " ".join(cell(r, c_manager).split()) or None,
            "lat": lat,
            "lng": lng,
            "mapsLink": link,
            "hours": hours,
            "openFrom": open_from,
            "openTo": open_to,
            "fuel": {
                "blend": {"available": "petrol" in products, "price": None},
                "diesel": {"available": "diesel" in products, "price": None},
            },
            "lubricants": "lubricants" in products,
            "refreshments": "refreshments" in products,
            "lpg": "gas" in products or "lpg" in products,
        })

    phones: dict[str, list[str]] = {}
    for s in stations:
        if s["phone"]:
            phones.setdefault(s["phone"], []).append(s["name"])
    for phone, names in phones.items():
        if len(names) > 1:
            warnings.append(f"{phone} is listed for {len(names)} stations: {', '.join(names)}")
    no_coords = sum(1 for s in stations if s["lat"] is None)
    no_manager = sum(1 for s in stations if not s["manager"])

    out = {
        "_meta": {
            "status": "REDAN_LIST",
            "source": src.name,
            "importedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "pricesCurrency": "USD per litre",
            "pricesUpdatedAt": None,
            "notes": "Generated by scripts/import_stations.py. Edit the spreadsheet and re-run; do not hand-edit.",
        },
        "stations": stations,
    }
    output.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(stations)} stations to {output}")
    print(f"  without map location: {no_coords}")
    print(f"  without site manager: {no_manager}")
    for w in warnings:
        print(f"  warning: {w}")


if __name__ == "__main__":
    main()
