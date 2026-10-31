// Pure-logic checks for src/logic.js. No Node on this machine: tools/run_tests.py runs this body in the
// game page's JS engine through the MCP bridge (any page, menu included), with MRLogic defined first.
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const D = Math.PI / 180;

// layout: far-apart bearings stay put.
{
  const out = MRLogic.layout([{ key: "a", angle: 0 }, { key: "b", angle: 90 * D }, { key: "c", angle: -90 * D }], 30 * D);
  check("layout keeps separated bearings", out.every((o) => MRLogic.diff(o.angle, o.displayAngle) < 1e-9), out.map((o) => o.displayAngle / D));
}
// layout: two portals on nearly the same bearing get spread to the minimum separation, around their mean.
{
  const out = MRLogic.layout([{ key: "near", angle: 10 * D }, { key: "far", angle: 14 * D }], 30 * D);
  const gap = MRLogic.diff(out[0].displayAngle, out[1].displayAngle) / D;
  const mean = MRLogic.norm(Math.atan2(Math.sin(out[0].displayAngle) + Math.sin(out[1].displayAngle), Math.cos(out[0].displayAngle) + Math.cos(out[1].displayAngle))) / D;
  check("layout spreads near-same bearings", Math.abs(gap - 30) < 0.01 && Math.abs(mean - 12) < 0.01, { gap, mean });
}
// layout: across the 0/360 seam.
{
  const out = MRLogic.layout([{ key: "a", angle: -2 * D }, { key: "b", angle: 2 * D }], 30 * D);
  check("layout spreads across the seam", Math.abs(MRLogic.diff(out[0].displayAngle, out[1].displayAngle) / D - 30) < 0.01, out.map((o) => o.displayAngle / D));
}
// layout: more portals than fit at minSep share the circle evenly.
{
  const items = Array.from({ length: 16 }, (_, i) => ({ key: "k" + i, angle: i * 0.5 * D }));
  const out = MRLogic.layout(items, 30 * D).map((o) => o.displayAngle).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 0; i < out.length; i++) minGap = Math.min(minGap, MRLogic.diff(out[i], out[(i + 1) % out.length]));
  check("layout crowded: all reachable", minGap / D > 22.4, { minGapDeg: minGap / D });
}
// pick: dead zone, nearest, max angle.
{
  const arrows = [{ key: "right", displayAngle: 0 }, { key: "down", displayAngle: 90 * D }];
  check("pick dead zone cancels", MRLogic.pick(arrows, 5, 5, 34, 80 * D) === null);
  check("pick right", MRLogic.pick(arrows, 100, 10, 34, 80 * D) === "right");
  check("pick down (y grows downward)", MRLogic.pick(arrows, 10, 100, 34, 80 * D) === "down");
  check("pick generous region", MRLogic.pick(arrows, 100, 80, 34, 80 * D) === "right");
  check("pick outside max angle", MRLogic.pick([{ key: "right", displayAngle: 0 }], -100, 0, 34, 80 * D) === null);
  check("pick none", MRLogic.pick([], 100, 0, 34, 80 * D) === null);
}
// release: quick click stays open, held + arrow confirms, held long on nothing cancels.
{
  const cfg = { holdConfirmMs: 220, holdCancelMs: 500 };
  check("release quick click stays", MRLogic.releaseAction(100, true, cfg) === "stay" && MRLogic.releaseAction(100, false, cfg) === "stay");
  check("release held on arrow confirms", MRLogic.releaseAction(300, true, cfg) === "confirm");
  check("release held on nothing, short: stays", MRLogic.releaseAction(400, false, cfg) === "stay");
  check("release held on nothing, >500 ms: cancels", MRLogic.releaseAction(501, false, cfg) === "cancel");
}
// cap: base until researched, then the highest researched tier.
{
  const cfg = { baseMaxPortals: 1, techs: [{ id: "a", maxPortals: 2 }, { id: "b", maxPortals: 5 }, { id: "c", maxPortals: 10 }] };
  check("cap base", MRLogic.maxPortals(cfg, () => false) === 1);
  check("cap tier 2", MRLogic.maxPortals(cfg, (id) => id === "a") === 2);
  check("cap tier 10", MRLogic.maxPortals(cfg, () => true) === 10);
}
// fuel column: vanilla 16 cells = the 4x4 tile above the base; 32 = two tiles.
{
  const v = MRLogic.fuelCells(100, 200, 16, 4), c = MRLogic.fuelCells(100, 200, 32, 4);
  check("fuel vanilla tile", v.length === 16 && Math.min(...v.map((p) => p.y)) === 196 && Math.max(...v.map((p) => p.y)) === 199 && Math.min(...v.map((p) => p.x)) === 100 && Math.max(...v.map((p) => p.x)) === 103);
  check("fuel 32 = two tiles", c.length === 32 && Math.min(...c.map((p) => p.y)) === 192);
  const q = MRLogic.fuelCells(100, 200, 64, 4);
  check("fuel 64 (default, 4x vanilla) = four tiles", q.length === 64 && Math.min(...q.map((p) => p.y)) === 184);
  check("fuel bottom row first", c[0].y === 199);
}
return { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) , total: results.length };
