// Pure picker logic: no game state, no DOM. Angles are radians, y grows downward (screen and world agree).
const MRLogic = (() => {
  const TAU = Math.PI * 2;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const diff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? TAU - d : d; };

  const signed = (a) => norm(a + Math.PI) - Math.PI; // (-PI, PI]

  // Arrow radius for a portal: the ring stands for a typical trip (refCells); nearer portals sit inside it, farther ones outside,
  // on a gentle log scale: ringPx * (1 + gain * ln(distance / refCells)), clamped to [rMin, rMax].
  function radiusFor(distance, refCells, ringPx, rMin, rMax, gain) {
    const r = ringPx * (1 + gain * Math.log(Math.max(1, distance) / refCells));
    return Math.min(rMax, Math.max(rMin, r));
  }

  // Minimum angle between two arrows: minSep on the same radius, easing down to floorSep once their radii differ by radialPx.
  function separation(ra, rb, minSep, floorSep, radialPx) {
    if (!radialPx || ra === undefined || rb === undefined) return minSep;
    const f = Math.max(0, 1 - Math.abs(ra - rb) / radialPx);
    return floorSep + (minSep - floorSep) * f;
  }

  // Spread display angles so no two arrows sit closer than their separation, keeping each as near its true bearing as possible.
  // Input: [{key, angle, radius?}]. Output: same order, with displayAngle added.
  function layout(items, minSep, floorSep, radialPx) {
    const n = items.length;
    if (n === 0) return [];
    // Crowded: shrink every separation so all arrows still fit around the circle.
    const scale = Math.min(1, TAU / (n * minSep));
    const d = items.map((it) => norm(it.angle));
    const floor = floorSep === undefined ? minSep : floorSep;
    for (let iter = 0; iter < 300 && n > 1; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const sep = scale * separation(items[i].radius, items[j].radius, minSep, floor, radialPx);
        let gap = signed(d[j] - d[i]);
        if (Math.abs(gap) >= sep - 1e-6) continue;
        // Identical bearings: break the tie by input order.
        const dir = gap === 0 ? 1 : Math.sign(gap), push = (sep - Math.abs(gap)) / 2;
        d[i] -= dir * push; d[j] += dir * push; moved = true;
      }
      if (!moved) break;
    }
    return items.map((it, i) => Object.assign({}, it, { displayAngle: norm(d[i]) }));
  }

  // Which arrow the pointer selects: nearest display angle, outside the dead zone, within maxSel.
  function pick(arrows, dx, dy, deadZone, maxSel) {
    if (Math.hypot(dx, dy) < deadZone) return null;
    const a = Math.atan2(dy, dx);
    let best = null, bestD = Infinity;
    for (const ar of arrows) { const dd = diff(a, ar.displayAngle); if (dd < bestD) { bestD = dd; best = ar; } }
    return best && bestD <= maxSel ? best.key : null;
  }

  // What releasing the button does, given how long it was held and whether an arrow is highlighted.
  // A quick click leaves the picker open; a held press confirms the highlighted arrow, or cancels from holdCancelMs.
  function releaseAction(heldMs, hasHover, cfg) {
    if (heldMs < cfg.holdConfirmMs) return "stay";
    if (hasHover) return "confirm";
    return heldMs >= cfg.holdCancelMs ? "cancel" : "stay";
  }

  // Portal cap from researched techs: the highest unlocked maxPortals, or the base.
  function maxPortals(cfg, isResearched) {
    let max = cfg.baseMaxPortals;
    for (const t of cfg.techs) if (isResearched(t.id)) max = Math.max(max, t.maxPortals);
    return max;
  }

  const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  // Cells of the fuel column directly above a portal's base (x, y = portal top-left cell), bottom row first.
  function fuelCells(x, y, costCells, width) {
    const rows = Math.ceil(costCells / width), cells = [];
    for (let r = 1; r <= rows; r++) for (let c = 0; c < width; c++) cells.push({ x: x + c, y: y - r });
    return cells.slice(0, costCells);
  }

  return { TAU, norm, diff, radiusFor, separation, layout, pick, releaseAction, maxPortals, easeOut, fuelCells };
})();
