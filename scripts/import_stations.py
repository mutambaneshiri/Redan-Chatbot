"""
Convert Redan's station spreadsheet into src/data/stations.json.

    npm run import:stations
    python scripts/import_stations.py ["path/to/station file.xlsx"] [output.json]

Default input: the most recently saved station-details spreadsheet in
data-sources/ (one with CONTACT and PRODUCTS columns), so a renamed copy such
as "Station Details1.xlsx" is picked up automatically.

Any other spreadsheet in data-sources/ with STATION NAME, LATITUDE and
LONGITUDE columns (e.g. "Redan Locations.xlsx") supplies map positions for
stations whose details row has none.

Uses only the Python standard library (an .xlsx file is a zip of XML), so
there is nothing to pip install.

Columns are found by their header text, so their order does not matter.
Required: STATION NAME, TOWN, OPERATING HOURS, CONTACT, PRODUCTS.
Optional, picked up automatically when present:
  DIESEL 50 PRICE / DIESEL PRICE, BLEND PRICE / PETROL PRICE, LPG PRICE
    (USD; the prices the bot quotes — the file's save date is shown as the
    "updated" date),
  SITE MANAGER, LANDLINE (used only when a station has no cell number),
  ADDRESS, LATITUDE, LONGITUDE, MAPS LINK (a Google Maps link),
  OPEN FROM / OPEN TO (e.g. 06:00 / 18:00, for 12-hour stations).

Stations with no ADDRESS fall back to data-sources/website-addresses.json
(addresses published on redan.co.zw). Stations with no coordinates fall back
to data-sources/station-locations.json (positions with a recorded source).
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data-sources"
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


def header_of(path: Path) -> tuple[list[list[str]], int | None, list[str]]:
    """Rows, index of the STATION NAME header row, and its upper-cased cells."""
    rows = read_first_sheet(path)
    at = next(
        (i for i, r in enumerate(rows) if any("STATION NAME" in c.upper() for c in r)),
        None,
    )
    return rows, at, ([c.upper().strip() for c in rows[at]] if at is not None else [])


def locations_from_sheets(skip: Path) -> dict[str, tuple[float, float, str]]:
    """Station name (lower case) -> (lat, lng, file) from location spreadsheets."""
    found: dict[str, tuple[float, float, str]] = {}
    for f in sorted(SOURCES.glob("*.xlsx"), key=lambda f: f.stat().st_mtime):
        if f.name.startswith("~$") or f.resolve() == skip.resolve():
            continue
        rows, at, header = header_of(f)
        if at is None or "LATITUDE" not in header or "LONGITUDE" not in header:
            continue
        cn, cla, clo = (header.index(h) for h in ("STATION NAME", "LATITUDE", "LONGITUDE"))
        for r in rows[at + 1:]:
            get = lambda i: r[i].strip() if i < len(r) else ""
            if get(cn) and get(cla) and get(clo):
                try:
                    found[get(cn).lower()] = (float(get(cla)), float(get(clo)), f.name)
                except ValueError:
                    print(f"  warning: {f.name}: bad coordinates for {get(cn)}")
    return found


def main() -> None:
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
    else:
        details = [
            f for f in sorted(SOURCES.glob("*.xlsx"), key=lambda f: f.stat().st_mtime)
            if not f.name.startswith("~$")
            and {"CONTACT", "PRODUCTS"} <= set(header_of(f)[2])
        ]
        if not details:
            sys.exit(f"No station-details spreadsheet (with CONTACT and PRODUCTS columns) in {SOURCES}")
        src = details[-1]
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else OUTPUT
    if not src.exists():
        sys.exit(f"Station file not found: {src}")
    print(f"Reading {src.name}")

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
    c_diesel_price = col("DIESEL 50 PRICE", "DIESEL PRICE", "D50 PRICE")
    c_blend_price = col("BLEND PRICE", "PETROL PRICE", "E20 PRICE")
    c_lpg_price = col("LPG PRICE", "GAS PRICE")

    def price(r: list[str], i: int | None, name: str, label: str) -> float | None:
        if i is None:
            return None
        raw = cell(r, i).replace("$", "").strip()
        if not raw:
            warnings.append(f"{name}: no {label}")
            return None
        try:
            value = round(float(raw), 2)
        except ValueError:
            warnings.append(f"{name}: {label} '{raw}' is not a number")
            return None
        if not 0.5 <= value <= 5:
            warnings.append(f"{name}: {label} ${value} looks wrong")
        return value
    missing = [n for n, c in [("STATION NAME", c_name), ("TOWN", c_town),
               ("OPERATING HOURS", c_hours), ("CONTACT", c_phone),
               ("PRODUCTS", c_products)] if c is None]
    if missing:
        sys.exit(f"Missing required column(s): {', '.join(missing)}")

    def cell(r: list[str], i: int | None) -> str:
        return r[i].strip() if i is not None and i < len(r) else ""

    web_file = SOURCES / "website-addresses.json"
    web_addresses = {
        k.lower(): v
        for k, v in (json.loads(web_file.read_text(encoding="utf-8")) if web_file.exists() else {}).items()
        if not k.startswith("_")
    }

    sheet_locations = locations_from_sheets(skip=src)
    if sheet_locations:
        files = sorted({v[2] for v in sheet_locations.values()})
        print(f"  map positions for {len(sheet_locations)} stations from {', '.join(files)}")

    loc_file = SOURCES / "station-locations.json"
    known_locations = {
        k.lower(): v
        for k, v in (json.loads(loc_file.read_text(encoding="utf-8")) if loc_file.exists() else {}).items()
        if not k.startswith("_")
    }

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
        if lat is None and name.lower() in sheet_locations:
            lat, lng, _ = sheet_locations[name.lower()]
        known = known_locations.get(name.lower(), {})
        if lat is None and "lat" in known and "lng" in known:
            lat, lng = float(known["lat"]), float(known["lng"])

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
            "address": cell(r, c_address) or known.get("address") or web_addresses.get(name.lower()),
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
                "blend": {"available": "petrol" in products,
                          "price": price(r, c_blend_price, name, "blend price")},
                "diesel": {"available": "diesel" in products,
                           "price": price(r, c_diesel_price, name, "diesel price")},
            },
            "lubricants": "lubricants" in products,
            "refreshments": "refreshments" in products,
            "lpg": "gas" in products or "lpg" in products,
            "lpgPrice": price(r, c_lpg_price, name, "LPG price"),
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
            # The spreadsheet has no price date, so use the day it was saved.
            "pricesUpdatedAt": datetime.fromtimestamp(src.stat().st_mtime).strftime("%Y-%m-%d")
            if c_diesel_price is not None or c_blend_price is not None else None,
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
