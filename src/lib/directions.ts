import { resolvePlace, describePlace } from "./places";
import { findStations, stationRouteTarget } from "./stations";

/**
 * Google Maps directions between any two points a customer can name: a Redan
 * station, Redan Head Office, or any place in Zimbabwe. Links are built here,
 * from map positions, so the model never has to compose a URL itself.
 */

/** Redan Head Office, 2 Northridge Close, Northridge Park, Borrowdale. */
export const HEAD_OFFICE = {
  name: "Redan Head Office",
  address: "2 Northridge Close, Northridge Park, Borrowdale, Harare",
  // Northridge Close on OpenStreetMap (looked up 2026-10-17). Replace with a
  // pin from the building if it is ever off.
  lat: -17.7784452,
  lng: 31.0919742,
};

type Point = { label: string; target: string };

const HEAD_OFFICE_WORDS = /\b(head ?office|hq|headquarters|redan offices?|main office|northridge)\b/i;
const HERE_WORDS = /^(here|my (current )?location|current location|where i am|me)$/i;

/** Turns what the customer named into a map target, or null if unknown. */
export function resolvePoint(text: string): Point | null {
  const t = text.trim();
  if (!t) return null;
  if (HEAD_OFFICE_WORDS.test(t)) {
    return { label: `${HEAD_OFFICE.name} (${HEAD_OFFICE.address})`, target: `${HEAD_OFFICE.lat},${HEAD_OFFICE.lng}` };
  }
  const station = findStations({ city: t }).stations;
  // Only a clear station match counts here; a bare town ("Harare") matches
  // many stations and is better treated as a place.
  if (station.length === 1 || (station.length > 1 && station[0].name.toLowerCase().includes(t.toLowerCase().replace(/^redan\s+/, "")))) {
    return { label: station[0].name, target: stationRouteTarget(station[0]) };
  }
  const place = resolvePlace(t);
  if (place) return { label: describePlace(place), target: `${place.lat},${place.lng}` };
  return null;
}

export function directionsLink(to: string, from?: string): {
  link?: string;
  from?: string;
  to?: string;
  error?: string;
} {
  const dest = resolvePoint(to);
  if (!dest) return { error: `Could not find "${to}" on the map. Ask the customer which Redan station, or which town or suburb, they mean.` };
  const fromHere = !from || HERE_WORDS.test(from.trim());
  const origin = fromHere ? null : resolvePoint(from!);
  if (!fromHere && !origin) {
    return { error: `Could not find the starting point "${from}" on the map. Ask the customer where they are starting from, or offer directions from their current location.` };
  }
  const params = new URLSearchParams({ api: "1", travelmode: "driving", destination: dest.target });
  if (origin) params.set("origin", origin.target);
  return {
    link: `https://www.google.com/maps/dir/?${params.toString()}`,
    from: origin ? origin.label : "the customer's current location",
    to: dest.label,
  };
}
