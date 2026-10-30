// Pure picker logic: no game state, no DOM. Angles are radians, y grows downward (screen and world agree).
const RNLogic = (() => {
  const TAU = Math.PI * 2;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const diff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? TAU - d : d; };

  // Spread display angles so no two arrows sit closer than minSep, keeping each as near its true bearing as possible.
  // Input: [{key, angle}]. Output: same order, with displayAngle added.
  function layout(items, minSep) {
    const n = items.length;
    if (n === 0) return [];
    const sep = Math.min(minSep, TAU / n);
    const sorted = items.map((it, i) => ({ i, a: norm(it.angle) })).sort((p, q) => p.a - q.a);
    const d = sorted.map((s) => s.a);
    if (n > 1) {
      for (let iter = 0; iter < 200; iter++) {
        let moved = false;
        for (let k = 0; k < n; k++) {
          const j = (k + 1) % n;
          let gap = d[j] - d[k];
          if (j === 0) gap += TAU;
          if (gap < sep - 1e-6) { const push = (sep - gap) / 2; d[k] -= push; d[j] += push; moved = true; }
        }
        if (!moved) break;
      }
    }
    const out = new Array(n);
    sorted.forEach((s, k) => { out[s.i] = Object.assign({}, items[s.i], { displayAngle: norm(d[k]) }); });
    return out;
  }

  // Which arrow the pointer selects: nearest display angle, outside the dead zone, within maxSel.
  function pick(arrows, dx, dy, deadZone, maxSel) {
    if (Math.hypot(dx, dy) < deadZone) return null;
    const a = Math.atan2(dy, dx);
    let best = null, bestD = Infinity;
    for (const ar of arrows) { const dd = diff(a, ar.displayAngle); if (dd < bestD) { bestD = dd; best = ar; } }
    return best && bestD <= maxSel ? best.key : null;
  }

  // Stable short labels: A..Z, AA.. Never reused, so a label always names the same portal.
  function labelFor(index) {
    let s = "", n = index;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }

  // Cells of the fuel column directly above a portal's base (x, y = portal top-left cell), bottom row first.
  function fuelCells(x, y, costCells, width) {
    const rows = Math.ceil(costCells / width), cells = [];
    for (let r = 1; r <= rows; r++) for (let c = 0; c < width; c++) cells.push({ x: x + c, y: y - r });
    return cells.slice(0, costCells);
  }

  return { TAU, norm, diff, layout, pick, labelFor, fuelCells };
})();
