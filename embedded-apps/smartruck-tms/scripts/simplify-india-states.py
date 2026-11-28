#!/usr/bin/env python3
"""Builds public/india-states.json: a light India state/UT outline used as the Plant Map's own background,
so the plants stay on a recognisable map where the street-tile server (tile.openstreetmap.org) is blocked.

Source (public community data, ~15 MB, not stored here):
  https://raw.githubusercontent.com/datameet/maps/master/website/docs/data/geojson/states.geojson
Usage:  python3 scripts/simplify-india-states.py <states.geojson> [tolerance_degrees=0.02]
Douglas-Peucker per ring, coordinates rounded to 3 decimals, tiny islands/rings dropped. Output is a GeoJSON
FeatureCollection with only the state name ("name").
"""
import json, math, sys

def dp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy) or 1e-12
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n
            if d > best: best, bi = d, i
        if best > eps: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def ring_dp(ring, eps):
    # a closed ring has identical end points (a zero-length baseline): split it at the point farthest from the start first
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    if len(pts) < 4: return ring
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[:far + 1], eps); b = dp(pts[far:] + [pts[0]], eps)
    return a[:-1] + b                                    # b ends on the start point again: the ring stays closed

def area(r):
    return abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2

def main():
    src = sys.argv[1]; eps = float(sys.argv[2]) if len(sys.argv) > 2 else 0.02
    d = json.load(open(src)); out = []
    for f in d['features']:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        keep = []
        for poly in polys:
            rings = []
            for i, ring in enumerate(poly):
                ring = [(round(x, 3), round(y, 3)) for x, y in ring]
                s = ring_dp(ring, eps)
                if len(s) < 4 or (i == 0 and area(s) < 0.01): break   # drop slivers and tiny islands (< ~100 km2)
                rings.append([list(p) for p in s])
            if rings: keep.append(rings)
        if keep: out.append({'type': 'Feature', 'properties': {'name': f['properties'].get('ST_NM', '')}, 'geometry': {'type': 'MultiPolygon', 'coordinates': keep}})
    json.dump({'type': 'FeatureCollection', 'features': out}, open('public/india-states.json', 'w'), separators=(',', ':'))
    print('features', len(out))

main()
