import { useEffect, useMemo, useState } from "react";
import { searchPlaces } from "../../lib/geocode";

export interface LocationValue {
  name: string;
  coords?: { lat: number; lon: number };
}

interface LocationFieldProps {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  knownLocations: string[];
  placeholder?: string;
  id?: string;
}

/** Google-Maps-style "type a place, get real places back" — free via OpenStreetMap Nominatim. */
export function LocationField({ value, onChange, knownLocations, placeholder, id }: LocationFieldProps) {
  const [open, setOpen] = useState(false);
  const [placeResults, setPlaceResults] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [searching, setSearching] = useState(false);

  const q = value.name.trim();
  const recentMatches = useMemo(() => {
    const lower = q.toLowerCase();
    const pool = lower ? knownLocations.filter((l) => l.toLowerCase().includes(lower) && l.toLowerCase() !== lower) : knownLocations;
    return pool.slice(0, 4);
  }, [q, knownLocations]);

  useEffect(() => {
    if (q.length < 3) {
      setPlaceResults([]);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then((results) => setPlaceResults(results.map((r) => ({ name: r.displayName, lat: r.lat, lon: r.lon }))))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [q]);

  const showRecent = recentMatches.length > 0;
  const showPlaces = placeResults.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type="text"
        placeholder={placeholder ?? "Start typing a place — city, address, landmark"}
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value, coords: undefined })}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        style={{ width: "100%" }}
      />
      {searching && (
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
          <span className="spinner" style={{ color: "var(--accent-deep)", width: 12, height: 12 }} />
        </span>
      )}
      {value.coords && (
        <span style={{ position: "absolute", right: searching ? 28 : 10, top: "50%", transform: "translateY(-50%)", color: "var(--sage)" }}>
          <PinIcon />
        </span>
      )}
      {open && (showRecent || showPlaces) && (
        <div style={DropdownStyle}>
          {showRecent && (
            <>
              <div style={DropdownGroupLabelStyle}>Used in this story</div>
              {recentMatches.map((loc) => (
                <button
                  key={`recent-${loc}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ name: loc, coords: undefined });
                    setOpen(false);
                  }}
                  style={DropdownRowStyle}
                >
                  {loc}
                </button>
              ))}
            </>
          )}
          {showPlaces && (
            <>
              <div style={DropdownGroupLabelStyle}>Places</div>
              {placeResults.map((place) => (
                <button
                  key={place.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ name: place.name, coords: { lat: place.lat, lon: place.lon } });
                    setOpen(false);
                  }}
                  style={DropdownRowStyle}
                >
                  {place.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

const DropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  boxShadow: "0 8px 20px -8px oklch(30% 0.03 50 / 0.4)",
  zIndex: 2,
  maxHeight: 240,
  overflowY: "auto",
};

const DropdownRowStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 13,
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--line)",
};

const DropdownGroupLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  padding: "8px 12px 4px",
};
