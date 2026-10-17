import placeData from "@/data/places.json";

/**
 * Every named place in Zimbabwe a customer might give as their location —
 * cities, suburbs, villages, growth points, business centres, communal lands,
 * missions, mines, schools, farms — from GeoNames (src/data/places.json, built
 * by scripts/build_places.py). Used to turn "I'm in Mabvuku" into coordinates
 * so stations can be ranked by distance even where Redan has no site.
 */
export type Place = {
  name: string;
  lat: number;
  lng: number;
  province: string | null;
  kind: string;
  population: number;
};

export type ResolvedPlace = Place & {
  /** Other, far-apart places with the same name, when the name is ambiguous. */
  alternatives: Place[];
};

type Row = [string, number, number, number, string, number, string[]?];

const PLACES: (Place & { alts: string[] })[] = (placeData.places as unknown as Row[]).map(
  ([name, lat, lng, prov, kind, population, alts]) => ({
    name,
    lat,
    lng,
    province: prov >= 0 ? placeData.provinces[prov] : null,
    kind,
    population,
    alts: alts ?? [],
  }),
);

/**
 * Lower = more likely to be what a customer means by a bare name. A town or
 * suburb called "Avondale" beats the several farms of that name.
 */
const KIND_RANK: Record<string, number> = {
  city: 0,
  suburb: 1,
  town: 1,
  village: 2,
  "business centre": 2,
  district: 3,
  "communal land": 3,
  area: 3,
  mission: 4,
  mine: 4,
  estate: 4,
  hospital: 4,
  airport: 4,
  airfield: 4,
  "railway station": 4,
  mall: 4,
  market: 4,
  hotel: 4,
  camp: 4,
  waterfall: 4,
  dam: 5,
  "power station": 5,
  bridge: 5,
  school: 6,
  farm: 7,
};
const rank = (p: Place) => KIND_RANK[p.kind] ?? 5;

/** Words GeoNames appends that customers leave off ("Rushinga Business Centre"). */
const GENERIC_SUFFIX =
  /\s+(business centre|growth point|service centre|township|communal land|tribal trust land|intensive conservation area|district|halt|siding|location|suburb|town|village)$/;

export function normalisePlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bmt\.?\s/g, "mount ")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = new Map<string, Place[]>();
function addKey(key: string, p: Place) {
  if (!key) return;
  const list = INDEX.get(key);
  if (!list) INDEX.set(key, [p]);
  else if (!list.includes(p)) list.push(p);
}
for (const p of PLACES) {
  for (const label of [p.name, ...p.alts]) {
    const key = normalisePlace(label);
    addKey(key, p);
    addKey(key.replace(GENERIC_SUFFIX, ""), p);
  }
}
const KEYS = [...INDEX.keys()];

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Levenshtein distance: how many single-letter edits turn a into b. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Words that are never a place on their own. */
const FILLER = new Set(
  "i im am in at near by around the a of my we are is to from close next zimbabwe zim redan station service garage area side road street avenue main stay staying live living ndiri ndinogara ngikhona ngihlala".split(
    " ",
  ),
);

/**
 * Exact lookups for a phrase, also trying it without a Shona/Ndebele locative
 * prefix ("kuMabvuku", "paMasvingo", "eBulawayo", "koNkulumane").
 */
function lookupExact(phrase: string): Place[] {
  const direct = INDEX.get(phrase) ?? INDEX.get(phrase.replace(GENERIC_SUFFIX, ""));
  if (direct) return direct;
  const m = phrase.match(/^(?:ku|pa|mu|ko|e)-?\s?([a-z].{3,})$/);
  return m ? (INDEX.get(m[1]) ?? []) : [];
}

const populated = (h: Place[]) => h.some((p) => rank(p) <= 2);

/**
 * Like lookupExact, but people often add an "s" to a place name
 * ("Highfields" for the Harare suburb Highfield). When the name as typed only
 * matches minor places (a railway siding, farm or mine) and the name without
 * the "s" is a suburb, town or village, the populated place wins.
 */
function lookup(phrase: string): Place[] {
  const found = lookupExact(phrase);
  if (phrase.length > 4 && phrase.endsWith("s") && !populated(found)) {
    const singular = lookupExact(phrase.slice(0, -1));
    if (populated(singular)) return singular;
  }
  return found;
}

/** Every exact hit in the text: whole parts first, then word runs, longest first. */
function exactHits(text: string): Place[][] {
  const parts = text
    .split(/,|;|\/|\bin\b|\bnear\b|\bat\b|\bby\b|\bclose to\b/i)
    .map(normalisePlace)
    .filter(Boolean);
  const hits: Place[][] = [];
  const used = new Set<string>();
  for (const part of parts) {
    const whole = lookup(part);
    if (whole.length > 0) {
      hits.push(whole);
      continue;
    }
    const words = part.split(" ");
    const taken = new Array(words.length).fill(false);
    for (let n = Math.min(words.length, 4); n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        if (taken.slice(i, i + n).some(Boolean)) continue;
        const phrase = words.slice(i, i + n).join(" ");
        if (n === 1 && (FILLER.has(phrase) || phrase.length < 3)) continue;
        if (used.has(phrase)) continue;
        const found = lookup(phrase);
        if (found.length > 0) {
          hits.push(found);
          used.add(phrase);
          for (let k = i; k < i + n; k++) taken[k] = true;
        }
      }
    }
  }
  return hits;
}

/** Closest spellings to a misspelt word, over populated places only. */
function fuzzyHits(text: string): Place[][] {
  const words = normalisePlace(text)
    .split(" ")
    .filter((w) => w.length >= 5 && !FILLER.has(w));
  const hits: Place[][] = [];
  for (const w of words) {
    const allowed = w.length >= 8 ? 2 : 1;
    let best: Place[] = [];
    let bestD = allowed + 1;
    for (const key of KEYS) {
      if (Math.abs(key.length - w.length) > allowed || key.includes(" ")) continue;
      const d = editDistance(w, key);
      if (d < bestD) {
        const found = INDEX.get(key)!.filter((p) => rank(p) <= 4);
        if (found.length > 0) {
          best = found;
          bestD = d;
        }
      }
    }
    if (best.length > 0) hits.push(best);
  }
  return hits;
}

function byLikelihood(a: Place, b: Place): number {
  return rank(a) - rank(b) || b.population - a.population;
}

/**
 * Turns free text ("Highfield", "Glen View, Harare", "kuMabvuku", "near
 * Chishawasha Mission", "Murambinda") into one place with coordinates.
 *
 * When the text names more than one place, the most specific one is the
 * answer and the others are context: "Highfield, Harare" is the Highfield
 * nearest Harare, not the farm of that name in Manicaland. Returns null when
 * nothing in the text is a known Zimbabwean place. With fuzzy, a misspelt
 * name ("Kuwadzan") is matched to the closest spelling.
 */
export function resolvePlace(
  text: string,
  { fuzzy = true }: { fuzzy?: boolean } = {},
): ResolvedPlace | null {
  let hits = exactHits(text);
  if (hits.length === 0 && fuzzy) hits = fuzzyHits(text);
  if (hits.length === 0) return null;

  // Most specific = a suburb, town or village over the city it is in, then
  // districts and areas, then landmarks; schools and farms come last.
  const specificity = (h: Place[]) => {
    const r = Math.min(...h.map(rank));
    return r === 0 ? 2.5 : r;
  };
  const ordered = [...hits].sort((a, b) => specificity(a) - specificity(b));
  const primary = ordered[0];
  const context = ordered.slice(1).map((h) => [...h].sort(byLikelihood)[0]);

  let candidates = [...primary].sort(byLikelihood);
  if (context.length > 0) {
    const near = (p: Place) =>
      Math.min(...context.map((c) => haversineKm(p.lat, p.lng, c.lat, c.lng)));
    // Among same-named places close to the context, the likeliest kind wins:
    // Msasa the suburb, not the Msasa railway siding next to it.
    const far = (p: Place) => (near(p) > 50 ? 1 : 0);
    candidates = [...primary].sort(
      (a, b) => far(a) - far(b) || byLikelihood(a, b) || near(a) - near(b),
    );
  }

  const chosen = candidates[0];
  // Same name, somewhere else entirely, and just as plausible. A city or a
  // city suburb is what people mean, so those are never called ambiguous.
  const alternatives: Place[] = [];
  if (context.length === 0 && chosen.kind !== "city" && chosen.kind !== "suburb") {
    for (const p of candidates.slice(1)) {
      if (
        rank(p) <= rank(chosen) &&
        haversineKm(p.lat, p.lng, chosen.lat, chosen.lng) > 30 &&
        !alternatives.some((a) => haversineKm(p.lat, p.lng, a.lat, a.lng) < 30)
      ) {
        alternatives.push(p);
      }
    }
  }
  return { ...chosen, alternatives: alternatives.slice(0, 3) };
}

/** The nearest populated place to a coordinate, to name where a shared pin is. */
export function nearestPlace(lat: number, lng: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of PLACES) {
    if (rank(p) > 2) continue;
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best && bestD <= 25 ? best : null;
}

export function describePlace(p: Place): string {
  return p.province && p.province !== p.name ? `${p.name} (${p.province})` : p.name;
}
