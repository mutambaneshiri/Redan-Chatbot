"""
Build src/data/places.json: every named place in Zimbabwe a customer might
give as their location (cities, suburbs, towns, villages, growth points,
business centres, communal lands, missions, mines, schools, farms), with
coordinates, so the bot can find the nearest Redan station to any of them.

    npm run build:places
    python scripts/build_places.py [path/to/ZW.txt]

Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0. With no
argument the Zimbabwe extract is downloaded from download.geonames.org.

Uses only the Python standard library.
"""

import io
import json
import re
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "src" / "data" / "places.json"
SOURCE_URL = "https://download.geonames.org/export/dump/ZW.zip"

PROVINCES = {
    "01": "Manicaland",
    "02": "Midlands",
    "03": "Mashonaland Central",
    "04": "Mashonaland East",
    "05": "Mashonaland West",
    "06": "Matabeleland North",
    "07": "Matabeleland South",
    "08": "Masvingo",
    "09": "Bulawayo",
    "10": "Harare",
}
PROVINCE_LIST = list(PROVINCES.values())

# GeoNames feature code -> our kind. Anything not listed (rivers, hills,
# forests...) is left out: nobody gives a stream as their address, and those
# names would collide with real places.
KINDS = {
    "P": {
        "PPLC": "city", "PPLA": "city", "PPLA2": "town", "PPL": "town",
        "PPLX": "suburb", "PPLL": "village", "PPLS": "village",
        "PPLF": "village", "PPLQ": None, "PPLH": None,
    },
    "A": {"ADM2": "district"},
    "L": {"CTRB": "business centre", "TRB": "communal land", "AREA": "area",
          "LCTY": "area", "RESV": "area", "AGRC": "area"},
    "S": {"MSSN": "mission", "MN": "mine", "MNAU": "mine", "EST": "estate",
          "SCH": "school", "SCHC": "school", "HSP": "hospital",
          "HSPC": "hospital", "HSPD": "hospital", "AIRP": "airport",
          "AIRF": "airfield", "RSTN": "railway station", "RSD": "railway station",
          "CMP": "camp", "HTL": "hotel", "MKT": "market", "MALL": "mall",
          "PS": "power station", "DAM": "dam", "FRM": "farm", "BDG": "bridge",
          "BCN": None},
    "H": {"FLLS": "waterfall", "DAM": "dam"},
}

# GeoNames errors found when checking against Redan's station towns. Keyed by
# GeoNames id; the value replaces the latitude/longitude.
FIXES: dict[str, tuple[float, float]] = {
    # Harare's Westgate is off Lomagundi Road, not out by Borrowdale.
    "11428674": (-17.774, 30.985),
}


def load_rows(path: Path | None) -> list[list[str]]:
    if path:
        text = path.read_text(encoding="utf-8")
    else:
        print(f"Downloading {SOURCE_URL} ...")
        with urllib.request.urlopen(SOURCE_URL) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
        text = z.read("ZW.txt").decode("utf-8")
    return [line.split("\t") for line in text.splitlines() if line]


def ascii_alts(name: str, alternates: str) -> list[str]:
    """Other spellings worth matching: plain-ASCII ones that differ by more than case."""
    seen = {name.lower()}
    out = []
    for a in alternates.split(","):
        a = a.strip()
        if (
            a
            and a.lower() not in seen
            and re.fullmatch(r"[A-Za-z][A-Za-z .'\-]{2,40}", a)
        ):
            seen.add(a.lower())
            out.append(a)
    return out[:4]


# Suburbs GeoNames files under the wrong province (e.g. Kuwadzana, Glen View
# and Budiriro under Mashonaland East instead of Harare). Checked against
# OpenStreetMap's province boundaries on 2026-10-15. Keyed by suburb name;
# applied only to places of kind "suburb".
PROVINCE_FIXES = {
    "Budiriro": "Harare",
    "Budiriro 4": "Harare",
    "Budiriro 5": "Harare",
    "Cannock Close": "Harare",
    "Cold Comfort": "Harare",
    "Crowborough North": "Harare",
    "Dzivareskwa": "Harare",
    "Gevstein Park": "Harare",
    "Glenview": "Harare",
    "Hillview": "Harare",
    "Hogerty Hill": "Harare",
    "Kuwadzana": "Harare",
    "Kuwadzana 3": "Harare",
    "Kuwadzana 4": "Harare",
    "Kuwadzana 5": "Harare",
    "Marimba Park": "Harare",
    "Mufakose": "Harare",
    "New Marlborough": "Harare",
    "Tynwald South": "Harare",
    "Homefield": "Mashonaland West",
    "Mount Hampden": "Mashonaland West",
    "Ascot": "Bulawayo",
    "Forestvale": "Bulawayo",
    "Pumula South": "Bulawayo",
    "Umguza Estate": "Bulawayo",
    "Waterford": "Bulawayo",
    "Waterlea": "Bulawayo",
}

# Only suburbs this close to Harare or Bulawayo are corrected, so a same-named
# suburb in another town keeps its own province.
CITY_CENTRES = [(-17.82772, 31.05337), (-20.15, 28.58333)]


# Everyday spellings GeoNames lacks, keyed by the GeoNames name. Only applied
# to places within 40 km of Gweru, so another place of the same name is left
# alone.
EXTRA_ALTS = {
    "Senka": ["Senga"],  # Gweru suburb, home of Midlands State University
}
EXTRA_ALT_CENTRES = [(-19.45, 29.81667)]  # Gweru


def near_city(lat: float, lng: float, km: float = 30, centres=None) -> bool:
    import math
    for clat, clng in centres or CITY_CENTRES:
        dlat, dlng = math.radians(lat - clat), math.radians(lng - clng)
        h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(clat)) * math.sin(dlng / 2) ** 2
        if 2 * 6371 * math.asin(math.sqrt(h)) <= km:
            return True
    return False


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    rows = load_rows(src)

    places = []
    for r in rows:
        gid, name, _ascii, alternates, lat, lng, fclass, fcode = r[:8]
        kind = KINDS.get(fclass, {}).get(fcode)
        if not kind:
            continue
        lat_f, lng_f = FIXES.get(gid, (float(lat), float(lng)))
        province = PROVINCES.get(r[10])
        if kind == "suburb" and name in PROVINCE_FIXES and near_city(float(lat), float(lng)):
            province = PROVINCE_FIXES[name]
        population = int(r[14] or 0)
        entry = [
            name,
            round(lat_f, 5),
            round(lng_f, 5),
            PROVINCE_LIST.index(province) if province else -1,
            kind,
            population,
        ]
        alts = ascii_alts(name, alternates)
        for extra in EXTRA_ALTS.get(name, []):
            if near_city(lat_f, lng_f, km=40, centres=EXTRA_ALT_CENTRES) and extra not in alts:
                alts.append(extra)
        if alts:
            entry.append(alts)
        places.append(entry)

    places.sort(key=lambda p: (p[0].lower(), p[1], p[2]))
    out = {
        "_meta": {
            "source": "GeoNames Zimbabwe extract (ZW.txt), https://www.geonames.org",
            "license": "CC BY 4.0, https://creativecommons.org/licenses/by/4.0/",
            "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "places: [name, lat, lng, provinceIndex (-1 = unknown), kind, population, alternateNames?]",
            "notes": "Generated by scripts/build_places.py. Re-run it rather than hand-editing.",
        },
        "provinces": PROVINCE_LIST,
        "places": places,
    }
    OUTPUT.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )

    counts: dict[str, int] = {}
    for p in places:
        counts[p[4]] = counts.get(p[4], 0) + 1
    print(f"Wrote {len(places)} places to {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")
    for kind, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {kind}: {n}")


if __name__ == "__main__":
    main()
