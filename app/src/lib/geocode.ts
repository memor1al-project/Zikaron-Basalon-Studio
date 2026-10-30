/**
 * Free place search via OpenStreetMap's Nominatim — no API key or billing,
 * unlike Google Places Autocomplete. Good enough for "type a place, get
 * real places back"; swap for Google Places later if that's ever needed.
 */
export interface PlaceSuggestion {
  displayName: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=6&addressdetails=0`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data: { display_name: string; lat: string; lon: string }[] = await res.json();
  return data.map((d) => ({ displayName: d.display_name, lat: Number(d.lat), lon: Number(d.lon) }));
}
