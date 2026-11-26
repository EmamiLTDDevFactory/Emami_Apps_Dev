# Loading Optimizer (3D truck loading planner)

Page **Loading Optimizer** in Trip Trail (`src/app/loading-optimizer`). Source brief: `loading optimization.docx`.
Enter the truck size and the carton types, press **Optimize loading**, and the planner compares volume, works out a real arrangement and animates it.

## What it shows
- **Dashboard:** truck capacity (CBM), total carton volume, volume utilisation %, unused volume, cartons that fit (of requested), and how many **more** cartons of a chosen reference carton would still fit.
- **Volume alone is misleading:** when the cartons add up to less than the truck's CBM but some do not fit because of their shapes, the page says so (example: 4 cubes of 60 cm = 0.86 CBM do not fit a 1 CBM truck 100 x 100 x 100 cm; only 1 does).
- **3D animation (three.js):** an empty truck, cartons sliding in one by one from the door end into their place, rows and layers outlined per block, unused pockets highlighted red when loading is complete. Views: 3D, side, top, door end. Play / pause / replay, a scrubber and speed control. Orbit with the mouse.
- **Report:** loading performance ring, per-carton table (requested / loaded / volume / weight / result), weight balance, status (Good loading / Optimization needed / Does not fit / Over the weight limit), print or save as PDF.
- **Status rule:** utilisation below the app's capacity minimum (Outward Rules, default 80 %) = "Optimization needed".

## Inputs
- Truck: a Trip Trail vehicle type (once its cargo length / width / height are set in Settings -> Outward Rules -> Vehicle types), an ISO container, or typed in (internal cm and payload kg).
- Carton types: name, length / width / height (cm), weight (kg), quantity, **Fragile** (nothing on top), **Can tip** (may lie on its side), **Max layers** (maximum stacked in one column). Inputs are remembered in the browser only.

## Packing method (`src/lib/packer.ts`)
Block building with guillotine space splitting: identical cartons are packed as rectangular blocks (rows x columns x layers); the truck is a list of free spaces; each step picks the space, orientation and block shape that place the most cartons, puts the block in the front-left-floor corner and splits what is left into right / front / top spaces. Every free space rests on the floor or exactly on the footprint of the block below, so cartons never float.
- Orientation: this-side-up (turn on the floor) by default; all six with "Can tip".
- Order: non-fragile before fragile, then larger cartons first, then heavier first (heavy at the bottom near the cab, fragile on top near the door).
- Fragile cartons: one layer, nothing placed on them. Max layers: tracked per column across stacked blocks.
- Weight: loading stops at the payload limit and reports it.
- Balance: share of the weight in the front / rear half and centre of gravity; warning outside 35-65 %. This is a guide - exact **axle limits** need the vehicle's axle data, which Trip Trail does not hold yet.
- Pure TypeScript, runs in the browser; 6,000 cartons in about 0.3 s.

## Tests
`node --test tests/packer.test.mjs` (14 tests): the document's 40 CBM / 32 CBM example (80 %, 8 CBM unused), the CBM trap, rotation, tipping, weight limit, max layers, fragile, load balance, "more cartons possible", invalid input, 300 random loads checked for overlap / support / fragile rule, and a performance test. Backend: vehicle-type cargo size test in `backend/test/tms.test.js`.

## Not in this release (next steps)
- **Carton sizes from SAP deliveries:** MARM holds carton L/W/H only for part of the materials (about 12 % of KAR rows on EDS: 460 of 3,808), so sizes are typed in for now. A delivery-item read in ZTMS_SRV (material, quantity, carton size and weight) would pre-fill the table from a trip's linked deliveries once master data is complete.
- Unloading sequence by drop point, axle-load check, pallets, per-carton stacking-weight limits.
- Link from the trip's loading check ("Plan the loading").
