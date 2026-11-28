#!/usr/bin/env python3
"""
Plant / depot locations for the Trip Trail "Plant Map" tab.

    python3 -I scripts/geocode-plants.py [--xlsx "~/Downloads/EXPORT 1 (1).XLSX"] [--out public/plant-locations.json] [--no-network]

Input  : SAP T001W export (WERKS, NAME1, STRAS, PSTLZ, ORT01, REGIO ...), 110 plants.
Order of truth for the coordinates of a plant:
  1. Distribution Planning tool (scripts/data/sanjoy-site-coords.json) when it has the plant code     -> source 'sanjoy-dp'
  2. geocode of the PIN code, accepted only if it lands near the plant's state                       -> source 'pincode'
  3. geocode of city + state                                                                          -> source 'city'
  4. free-text "city, state, India"                                                                   -> source 'city' (low)
  Nothing found -> lat/lon stay null and the plant is listed in `missing`. Coordinates are never invented.
PRIVACY: the public geocoder (Nominatim / OpenStreetMap) only ever receives a postal code, a city and a state name. No company name,
street, plant code or user information is sent. Results are cached in scripts/data/geocode-cache.json so a re-run makes no requests.
Throttled to 1 request / second with a generic User-Agent (Nominatim usage policy).
"""
import argparse, json, math, os, re, subprocess, sys, time, urllib.parse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_read  # noqa: E402

UA = "plant-geocode-script/1.0"
CACHE = os.path.join(HERE, "data", "geocode-cache.json")

# SAP region code (T001W-REGIO in this system) -> state, approximate centroid and the radius (km) inside which a hit is "in that state"
STATES = {
    "MRA": ("Maharashtra", 19.0, 75.5, 520), "URC": ("Uttarakhand", 30.1, 79.2, 260), "WBL": ("West Bengal", 23.0, 87.9, 400),
    "HCP": ("Himachal Pradesh", 31.9, 77.2, 260), "HRA": ("Haryana", 29.0, 76.2, 260), "PJB": ("Punjab", 31.0, 75.3, 230),
    "URP": ("Uttar Pradesh", 27.0, 80.9, 520), "GJR": ("Gujarat", 22.6, 71.6, 480), "ASM": ("Assam", 26.2, 92.5, 380),
    "PDY": ("Puducherry", 11.9, 79.8, 450), "ORS": ("Odisha", 20.5, 84.5, 420), "NDH": ("Delhi", 28.6, 77.2, 90),
    "TEL": ("Telangana", 17.8, 79.1, 320), "MPH": ("Madhya Pradesh", 23.5, 78.5, 580), "RJT": ("Rajasthan", 26.5, 74.0, 580),
    "JAK": ("Jammu and Kashmir", 33.7, 76.0, 480), "KTK": ("Karnataka", 14.8, 75.7, 480), "TNU": ("Tamil Nadu", 11.1, 78.4, 420),
    "BHR": ("Bihar", 25.7, 85.6, 320), "ARP": ("Andhra Pradesh", 15.9, 79.7, 480), "CGH": ("Chhattisgarh", 21.3, 81.8, 360),
    "JHD": ("Jharkhand", 23.6, 85.5, 320), "KRL": ("Kerala", 10.4, 76.5, 320), "TRP": ("Tripura", 23.8, 91.5, 130),
    "DAN": ("Dadra and Nagar Haveli and Daman and Diu", 20.3, 73.0, 160),
}
INDIA = (6.0, 37.0, 68.0, 98.0)  # lat min/max, lon min/max


def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def in_india(lat, lon):
    return INDIA[0] <= lat <= INDIA[1] and INDIA[2] <= lon <= INDIA[3]


def classify(code, sanjoy_type=""):
    if sanjoy_type == "MWH":
        return "MWH"
    c = code.upper()
    return "Depot" if c.startswith("DP") else "Unit" if c.startswith("UN") else "3P" if c.startswith("3P") else "Plant"


def clean_city(s):
    """ORT01 is free text cut at 25 characters ('POANTA-SAHIB, DIST-: SIRM', 'Chamble,Maharashtra'): keep the first meaningful place name."""
    s = re.sub(r"\s+", " ", (s or "").strip())
    for part in re.split(r"[,;]", s):
        p = re.sub(r"^(village|vill|distt?|dist)\.?\s*[-:]*\s*", "", part.strip(), flags=re.I).strip(" -:.")
        if len(p) >= 3 and not re.match(r"^(area|dist|distt|ind)", p, re.I):
            return p
    return ""


def load_cache():
    try:
        return json.load(open(CACHE))
    except Exception:
        return {}


class Geocoder:
    def __init__(self, network=True):
        self.cache, self.network, self.last, self.calls = load_cache(), network, 0.0, 0

    def save(self):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(self.cache, open(CACHE, "w"), indent=1, sort_keys=True)

    def query(self, **params):
        """Only these keys are ever sent: postalcode, city, state, q (a 'city, state, India' string)."""
        assert set(params) <= {"postalcode", "city", "state", "q"}
        key = json.dumps(params, sort_keys=True)
        if key in self.cache:
            return self.cache[key]
        if not self.network:
            return None
        wait = 1.05 - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"format": "jsonv2", "countrycodes": "in", "limit": 5, **params})
        out = None
        for attempt in range(3):
            self.last = time.time(); self.calls += 1
            r = subprocess.run(["curl", "-sS", "-m", "25", "-A", UA, url], capture_output=True, text=True)
            if r.returncode == 0 and r.stdout.strip().startswith("["):
                out = [{"lat": float(x["lat"]), "lon": float(x["lon"]), "display": x.get("display_name", "")[:140]} for x in json.loads(r.stdout)]
                break
            time.sleep(5 * (attempt + 1))
        if out is None:
            return None  # transient failure: do not cache
        self.cache[key] = out
        return out


def pick(results, st):
    """Closest hit to the state's centroid (or the first hit when the state is unknown) that is inside India."""
    ok = [r for r in (results or []) if in_india(r["lat"], r["lon"])]
    if not ok:
        return None, None
    if st:
        ok.sort(key=lambda r: km(r["lat"], r["lon"], st[1], st[2]))
        return ok[0], km(ok[0]["lat"], ok[0]["lon"], st[1], st[2])
    return ok[0], None


def locate(g, pin, city, st):
    """-> (lat, lon, source, confidence, note)"""
    state_name = st[0] if st else ""
    if re.fullmatch(r"\d{6}", pin or ""):
        h, d = pick(g.query(postalcode=pin), st)
        if h and (st is None or d <= st[3]):
            return h["lat"], h["lon"], "pincode", ("high" if st else "medium"), f"PIN {pin}" + ("" if st else " (state unknown, not cross-checked)")
        if h:
            note = f"PIN {pin} resolves {d:.0f} km from {state_name}: ignored"
        else:
            note = f"PIN {pin} not found"
    else:
        note = "no valid PIN"
    c = clean_city(city)
    if c and state_name:
        h, d = pick(g.query(city=c, state=state_name), st)
        if h and d <= st[3]:
            return h["lat"], h["lon"], "city", "medium", f"{note}; city '{c}', {state_name}"
        h, d = pick(g.query(q=f"{c}, {state_name}, India"), st)
        if h and d <= st[3]:
            return h["lat"], h["lon"], "city", "low", f"{note}; free-text '{c}, {state_name}'"
    elif c and not state_name:
        h, _ = pick(g.query(q=f"{c}, India"), None)
        if h:
            return h["lat"], h["lon"], "city", "low", f"{note}; free-text '{c}' (state unknown, not cross-checked)"
    elif state_name and not c:
        pass
    return None, None, None, None, note


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=os.path.expanduser("~/Downloads/EXPORT 1 (1).XLSX"))
    ap.add_argument("--out", default=os.path.join(HERE, "..", "public", "plant-locations.json"))
    ap.add_argument("--no-network", action="store_true")
    a = ap.parse_args()

    rows = xlsx_read.read(a.xlsx)["Sheet1"][1:]
    sjd = json.load(open(os.path.join(HERE, "data", "sanjoy-site-coords.json")))
    sj, fold = {s["code"]: s for s in sjd["sites"]}, sjd.get("fold", {})
    g = Geocoder(network=not a.no_network)
    plants, missing, unmapped = [], [], set()
    for r in rows:
        code = (r.get("A") or "").strip()
        if not code:
            continue
        pin, city, regio = (r.get("J") or "").strip(), (r.get("K") or "").strip(), (r.get("S") or "").strip()
        st = STATES.get(regio)
        if regio and not st:
            unmapped.add(regio)
        s = sj.get(code)
        geo = locate(g, pin, city, st)
        p = {"code": code, "name": (r.get("B") or "").strip(), "type": classify(code, s["type"] if s else ""), "city": city, "state": st[0] if st else "", "pincode": pin,
             "lat": None, "lon": None, "source": None, "confidence": None, "note": ""}
        if s and s.get("lat") is not None:
            p.update(lat=s["lat"], lon=s["lon"], source="sanjoy-dp", confidence="high", note="Distribution Planning tool")
            if geo[0] is not None:                      # cross-check his coordinates against the PIN code
                d = km(s["lat"], s["lon"], geo[0], geo[1])
                p["checkKm"] = round(d)
                if d > 100 and geo[3] == "high":        # SAP's own address (PIN verified against the state) beats a far-away planning-tool position
                    p.update(lat=round(geo[0], 5), lon=round(geo[1], 5), source="pincode", confidence="medium",
                             note=f"Distribution Planning tool puts {code} at {s['lat']}, {s['lon']}, {d:.0f} km from SAP's PIN {pin}: PIN position used, please confirm", altLat=s["lat"], altLon=s["lon"])
                elif d > 100:
                    p["confidence"] = "medium"; p["note"] = f"Distribution Planning coordinates are {d:.0f} km from the PIN/city position: check"
        elif geo[0] is not None:
            p.update(lat=round(geo[0], 5), lon=round(geo[1], 5), source=geo[2], confidence=geo[3], note=geo[4])
        else:
            # last resort: a code the planning tool folds into another depot (same physical depot, e.g. a Zandu / Amazon space), only if that depot's
            # coordinates are plausible for this plant's state
            t = sj.get(fold.get(code, ""))
            if t and t.get("lat") is not None and (st is None or km(t["lat"], t["lon"], st[1], st[2]) <= st[3]):
                p.update(lat=t["lat"], lon=t["lon"], source="sanjoy-dp", confidence="low", note=f"{geo[4]}; planned as {fold[code]} in the Distribution Planning tool, so {fold[code]}'s position is used")
            else:
                p["note"] = geo[4]
                missing.append(code)
        plants.append(p)
        print(f"{code:5} {p['type']:6} {str(p['source']):10} {str(p['confidence']):7} {p['note'][:90]}", flush=True)
    g.save()
    cnt = lambda k: {v: sum(1 for p in plants if str(p[k]) == v) for v in sorted({str(p[k]) for p in plants})}
    out = {"builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "plants": plants, "missing": missing,
           "counts": {"plants": len(plants), "withCoordinates": sum(1 for p in plants if p["lat"] is not None), "bySource": cnt("source"), "byConfidence": cnt("confidence"), "byType": cnt("type")},
           "unmappedRegions": sorted(unmapped), "attribution": "Geocoding (c) OpenStreetMap contributors (Nominatim)"}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(out, open(a.out, "w"), indent=1, ensure_ascii=False)
    print(json.dumps(out["counts"]), "missing:", missing, "unmapped regions:", out["unmappedRegions"], "requests:", g.calls)


if __name__ == "__main__":
    main()
