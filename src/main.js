// Multi-Recall runtime. Takes over the vanilla Recall Shard (recallDevice) through items.updateDefinition:
// several vanilla recall portals (homeBeacon), capped by research, a radial destination picker, a flat per-trip Voidbloom cost.
const SHARD = "recallDevice", PORTAL = "homeBeacon";
const CELL = 4; // px per cell
const api = sandkit.api, S = sandkit.state;
const GLOOM = sandkit.enums.ElementType.Gloom; // Voidbloom
const ActionState = sandkit.enums.ActionState, ActionType = sandkit.enums.ActionType;
const HOTBAR_OVERLAYS = sandkit.enums.ComponentId.HotbarOverlays;
const DEG = Math.PI / 180;

const log = (msg) => { try { window.electron.log("info", "multi-recall", msg); } catch (_) {} };
const counters = { trips: 0, refused: 0, cancelled: 0, fuelSpent: 0, opened: 0, placementsBlocked: 0 };

api.i18n.register("en", {
  "mods|multiRecall|hint": "Right-click: place portal ({count}/{max})",
  "mods|multiRecall|hintFull": "Portals {count}/{max}",
  "mods|multiRecall|limit": "Portal limit reached ({max}). Research more in the tech tree.",
  "mods|multiRecall|none": "No other recall portal.",
  "mods|multiRecall|cooldown": "Recall shard recharging.",
  "mods|multiRecall|cost": "{cost} Voidbloom",
});
api.i18n.register("en", Object.fromEntries(CONFIG.techs.flatMap((tech, i) => [
  ["tech|" + tech.id + "|name", "Recall Network " + ["I", "II", "III", "IV", "V"][i]],
  ["tech|" + tech.id + "|description", "Keep up to " + tech.maxPortals + " recall portals. Right-click with the Recall Shard to place one; click to choose where to go."],
])));
const t = (key, params) => api.i18n.t("mods|multiRecall|" + key, params);
const toast = (key, params) => api.ui.toast({ key, params });

// ---- research: three nodes after the vanilla Recall tech ----
let techsRegistered = false;
function registerTechs() {
  if (techsRegistered) return;
  let base = {};
  // Vanilla techs use numeric ids from enums.Tech; the config names them (e.g. "Recall").
  const parentId = sandkit.enums.Tech && sandkit.enums.Tech[CONFIG.parentTech] !== undefined ? sandkit.enums.Tech[CONFIG.parentTech] : CONFIG.parentTech;
  try { base = api.tech.getDefinitionById(parentId) || {}; } catch (e) { log("parent tech not readable yet: " + e); }
  let parent = parentId, ok = true;
  for (const tech of CONFIG.techs) {
    const def = {
      nameKey: "tech|" + tech.id + "|name",
      descriptionKey: "tech|" + tech.id + "|description",
      cost: tech.cost,
      branch: base.branch || "alien",
      requires: [parent],
      unlocks: {},
    };
    if (base.icon) def.icon = base.icon;
    if (base.sprite) def.sprite = base.sprite;
    try { api.tech.registerNode(tech.id, def, { parentId: parent }); }
    catch (e) { if (!/already/i.test(String(e && e.message))) { ok = false; log("tech " + tech.id + " not registered: " + e); } }
    parent = tech.id;
  }
  techsRegistered = ok;
}
const maxPortals = () => MRLogic.maxPortals(CONFIG, (id) => api.tech.isResearchedById(id));

// ---- per-world storage ----
function store() {
  const s = api.storage.ensure("multiRecall");
  if (s.version === undefined) { s.version = 1; s.lastTripAt = null; }
  return s;
}

// ---- portals: always rebuilt from the world's structures, never cached across frames ----
function portals() {
  const list = [];
  for (const st of S.store.structures) if (st.type === PORTAL) list.push({ key: st.x + "," + st.y, x: st.x, y: st.y });
  return list;
}

const player = () => S.store.player;
const playerCenter = () => { const p = player(); return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
// Vanilla arrival: centred on the portal, feet on its top edge.
const arrivalOf = (pt) => { const p = player(); return { x: (pt.x + 2) * CELL - p.width / 2, y: pt.y * CELL - p.height }; };

function arrivalBlocked(a) {
  const p = player();
  for (let cy = Math.floor(a.y / CELL); cy < Math.ceil((a.y + p.height) / CELL); cy++)
    for (let cx = Math.floor(a.x / CELL); cx < Math.ceil((a.x + p.width) / CELL); cx++)
      if (api.grid.isTerrainAtCell(cx, cy)) return true;
  return false;
}

const fuelCellsOf = (pt) => MRLogic.fuelCells(pt.x, pt.y, CONFIG.tripCostCells, CONFIG.fuelColumnWidthCells);
const fuelOf = (pt) => fuelCellsOf(pt).reduce((n, c) => n + (api.elements.getResolvedTypeAtCell(c.x, c.y) === GLOOM ? 1 : 0), 0);

// Status of one destination right now. reason is a vanilla toast key when unavailable.
function evaluate(pt) {
  const st = api.structures.getAtCell(pt.x, pt.y);
  if (!st || st.type !== PORTAL || st.queued) return { ok: false, reason: "mods|homeBeacon|notBuiltYet", fuel: 0 };
  const fuel = fuelOf(pt);
  // Blocked first: the arrival box sits inside the fuel column, so terrain there would otherwise read as missing fuel.
  if (arrivalBlocked(arrivalOf(pt))) return { ok: false, reason: "mods|homeBeacon|destinationBlocked", fuel };
  if (fuel < CONFIG.tripCostCells) return { ok: false, reason: "mods|homeBeacon|noVoidbloomFuel", fuel };
  return { ok: true, fuel };
}

// Destinations offered from here: every portal except the one you stand on.
function destinations() {
  const c = playerCenter(), p = player();
  return portals().map((pt) => {
    const a = arrivalOf(pt), ax = a.x + p.width / 2, ay = a.y + p.height / 2;
    return Object.assign(pt, { angle: Math.atan2(ay - c.y, ax - c.x), distanceCells: Math.round(Math.hypot(ax - c.x, ay - c.y) / CELL) });
  }).filter((d) => d.distanceCells >= CONFIG.hideCurrentPortalCells);
}

// ---- picker state (session only: a picker never survives a reload) ----
// closingAt != null: fading out, no longer takes input.
let picker = null; // { openedAt, held, hover, arrows, closingAt }
const nowReal = () => performance.now();
const isOpen = () => !!picker && picker.closingAt == null;

function openPicker() {
  if (destinations().length === 0) { toast("mods|multiRecall|none"); return; }
  picker = { openedAt: nowReal(), held: true, hover: null, arrows: [], closingAt: null };
  counters.opened++;
}
function closePicker(reason, animate) {
  if (!isOpen()) return;
  if (reason === "cancel") { counters.cancelled++; log("picker cancelled"); }
  if (animate === false) picker = null; else picker.closingAt = nowReal();
}

function confirm(key) {
  const pt = portals().find((p) => p.key === key);
  if (!pt) { counters.refused++; toast("mods|homeBeacon|notBuiltYet"); return false; }
  const s = store(), now = api.time.getTimeMs();
  if (s.lastTripAt != null && now >= s.lastTripAt && now - s.lastTripAt < CONFIG.cooldownMs) { counters.refused++; toast("mods|multiRecall|cooldown"); return false; }
  const ev = evaluate(pt);
  if (!ev.ok) { counters.refused++; toast(ev.reason); log("refused " + pt.key + ": " + ev.reason); return false; }
  // Spend exactly the flat cost from this portal's own column, then travel.
  for (const c of fuelCellsOf(pt)) api.elements.removeAtCellWhenIdle(c.x, c.y);
  counters.fuelSpent += CONFIG.tripCostCells;
  const from = playerCenter(), a = arrivalOf(pt), p = player();
  api.player.setPositionAtWorld(a.x, a.y);
  api.player.setVelocity(0, 0);
  api.camera.snapToPlayer();
  s.lastTripAt = now;
  counters.trips++;
  const to = { x: a.x + p.width / 2, y: a.y + p.height / 2 };
  const glow = [0.4, 0.1, 0.65, 1];
  api.effects.createLightAtWorld(from.x, from.y, { brightness: 1.5, duration: 100, size: 50, color: glow });
  api.effects.createLightAtWorld(to.x, to.y, { brightness: 1.5, duration: 100, size: 50, color: glow });
  api.effects.createParticlesAtWorld(to.x, to.y, { count: 40, minSpeed: 3, maxSpeed: 14, color: 0, minSize: 0.5, maxSize: 1, minLifetime: 0.5, maxLifetime: 1.5, background: false, fadeOutOnly: true });
  api.sound.playLayers([{ soundId: "flourish_spacey", opts: { volume: 0.2, playbackRate: 0.5, fadeOut: 0.8 } }, { soundId: "subtle_shooter", opts: { volume: 0.3, playbackRate: 0.5, fadeOut: 3 } }]);
  log("trip to " + pt.key + ", spent " + CONFIG.tripCostCells);
  return true;
}

// Pointer vector from the player, in overlay draw space (same space the picker is drawn in).
function pointer() {
  const c = playerCenter(), m = S.session.input.mouse.worldPosition;
  const pc = api.rendering.getDrawPositionAtWorld(c.x, c.y), pm = api.rendering.getDrawPositionAtWorld(m.x, m.y);
  return { cx: pc.x, cy: pc.y, dx: pm.x - pc.x, dy: pm.y - pc.y };
}

function refreshArrows() {
  // The highlighted portal vanished (removed while choosing): cancel rather than let the highlight slide to a neighbour.
  if (picker.hover && !portals().some((pt) => pt.key === picker.hover)) { closePicker("cancel"); toast("mods|homeBeacon|notBuiltYet"); return false; }
  const items = destinations().map((d) => Object.assign(d, { status: evaluate(d) }));
  picker.arrows = MRLogic.layout(items, CONFIG.minSeparationDeg * DEG);
  const ptr = pointer();
  picker.hover = MRLogic.pick(picker.arrows, ptr.dx, ptr.dy, CONFIG.deadZonePx, CONFIG.maxSelectDeg * DEG);
  return true;
}

// ---- placement: right-click with the shard, within the researched cap ----
function startPlacement() {
  const max = maxPortals();
  if (portals().length >= max) { counters.placementsBlocked++; toast("mods|multiRecall|limit", { max }); return; }
  api.ui.hotbar.selectAction({ type: ActionType.Building, id: PORTAL });
}

// ---- input the game would otherwise act on: Escape while picking, right-click while holding the shard ----
window.addEventListener("keydown", (e) => {
  if (!isOpen() || e.key !== "Escape") return;
  e.preventDefault(); e.stopImmediatePropagation();
  closePicker("cancel");
}, true);
const onRightButton = (e) => {
  if (e.button !== 2 || !api.items.isActiveById(SHARD) || !e.target || e.target.tagName !== "CANVAS") return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type !== "pointerdown") return;
  if (isOpen()) closePicker("cancel"); else startPlacement();
};
for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "contextmenu"]) window.addEventListener(type, onRightButton, true);

// ---- the shard ----
function handleAction(state) {
  const st = state.session.action.state;
  if (!isOpen()) {
    if (!st[ActionState.Start]) return;
    // No portal yet: the first click places one, like vanilla.
    if (portals().length === 0) { startPlacement(); return; }
    openPicker();
    if (isOpen() && st[ActionState.End]) picker.held = false;
    return;
  }
  if (!refreshArrows()) return;
  if (picker.held) {
    if (!st[ActionState.End]) return;
    picker.held = false;
    const action = MRLogic.releaseAction(nowReal() - picker.openedAt, !!picker.hover, CONFIG);
    if (action === "confirm") { if (confirm(picker.hover)) closePicker("trip", false); }
    else if (action === "cancel") closePicker("cancel");
    return;
  }
  if (st[ActionState.Start]) {
    if (!picker.hover) { closePicker("cancel"); return; } // centre dead zone or no direction: cancel
    if (confirm(picker.hover)) closePicker("trip", false);
  }
}

function drawArrow(ctx, x, y, ang, size, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, size * 0.75); ctx.lineTo(-size * 0.35, 0); ctx.lineTo(-size * 0.7, -size * 0.75); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.stroke();
  ctx.restore();
}
function text(ctx, s, x, y, color, font) {
  ctx.font = font || "bold 12px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function afterRender() {
  if (!picker) return;
  if (!api.items.isActiveById(SHARD)) { closePicker("cancel", false); picker = null; return; }
  const now = nowReal();
  let k;
  if (picker.closingAt != null) {
    const p = (now - picker.closingAt) / CONFIG.closeAnimMs;
    if (p >= 1) { picker = null; return; }
    k = 1 - MRLogic.easeOut(p);
  } else {
    if (!refreshArrows()) return;
    k = MRLogic.easeOut((now - picker.openedAt) / CONFIG.openAnimMs);
  }
  // Drawn even when the game marks the mouse unavailable (resting cursor, after a key press): the picker still takes clicks.
  const ptr = pointer(), R = CONFIG.ringRadiusPx * (0.7 + 0.3 * k);
  api.rendering.withOverlayContext((ctx) => {
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.arc(ptr.cx, ptr.cy, R, 0, MRLogic.TAU); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(190,140,255,0.45)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(ptr.cx, ptr.cy, CONFIG.deadZonePx * (0.7 + 0.3 * k), 0, MRLogic.TAU); ctx.fillStyle = "rgba(20,0,40,0.4)"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(190,140,255,0.7)"; ctx.stroke();
    for (const ar of picker.arrows) {
      const hov = ar.key === picker.hover, ok = ar.status.ok;
      const ax = ptr.cx + Math.cos(ar.displayAngle) * R, ay = ptr.cy + Math.sin(ar.displayAngle) * R;
      // True bearing tick on the ring, joined to the arrow when it was spread apart from a neighbour.
      if (MRLogic.diff(ar.angle, ar.displayAngle) > 0.5 * DEG) {
        const tx = ptr.cx + Math.cos(ar.angle) * R, ty = ptr.cy + Math.sin(ar.angle) * R;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ax, ay); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, MRLogic.TAU); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill();
      }
      const color = !ok ? (hov ? "rgba(230,120,120,1)" : "rgba(140,110,110,0.75)") : hov ? "rgba(255,230,120,1)" : "rgba(190,140,255,1)";
      drawArrow(ctx, ax, ay, ar.angle, hov ? 17 : 13, color);
      const lx = ptr.cx + Math.cos(ar.displayAngle) * (R + 30), ly = ptr.cy + Math.sin(ar.displayAngle) * (R + 30);
      const sub = ok ? ar.distanceCells + " cells" : ar.status.reason.endsWith("noVoidbloomFuel") ? ar.status.fuel + "/" + CONFIG.tripCostCells : ar.status.reason.endsWith("destinationBlocked") ? "blocked" : "not built";
      text(ctx, sub, lx, ly, color, hov ? "bold 13px monospace" : "11px monospace");
    }
    text(ctx, t("cost", { cost: CONFIG.tripCostCells }), ptr.cx, ptr.cy + R + 58, "rgba(210,190,240,0.75)", "11px monospace");
  });
}

// ---- small hint above the hotbar while the shard is held ----
function renderHint() {
  const h = sandkit.react.createElement, count = portals().length, max = maxPortals();
  const label = count < max ? t("hint", { count, max }) : t("hintFull", { count, max });
  return h("div", { className: "px-2 py-0.5 text-xs text-white/70 bg-black/50 rounded pointer-events-none select-none whitespace-nowrap" }, label);
}
let hint = null;
function syncHint() {
  const show = api.items.isActiveById(SHARD);
  if (show && !hint) hint = api.ui.regions.mount("hotbar", "multiRecallHint", { placement: "raised", render: renderHint });
  else if (!show && hint) { hint.unmount(); hint = null; }
  else if (hint) api.ui.update(HOTBAR_OVERLAYS);
}

// ---- wiring ----
let installed = false;
function install() {
  if (installed || !api.items.getDefinitionById(SHARD)) return;
  installed = true;
  api.items.updateDefinition(SHARD, { handleAction, afterRender });
  log("installed v" + VERSION + ", trip cost " + CONFIG.tripCostCells + " (vanilla " + CONFIG.vanillaTripCostCells + "), cap " + maxPortals());
}
try { registerTechs(); } catch (e) { log("tech registration failed at load: " + (e && e.stack || e)); }
api.events.on("game:ready", () => { picker = null; registerTechs(); install(); store(); syncHint(); });
api.events.on("action:changed", syncHint);
api.events.on("tech:unlocked", syncHint);
api.events.on("building:placed", (ev) => {
  if (!ev || !ev.structure || ev.structure.type !== PORTAL) return;
  // Safety net for any placement path that skipped our cap check: undo the extra portal.
  const max = maxPortals();
  if (portals().length > max) { api.structures.removeAtCell(ev.x, ev.y); counters.placementsBlocked++; toast("mods|multiRecall|limit", { max }); log("removed portal over cap at " + ev.x + "," + ev.y); }
  syncHint();
});
api.events.on("building:removed", syncHint);
install();

// Test and inspection handle (read-mostly; the MCP tests drive real input).
window.__multiRecall = { version: VERSION, config: CONFIG, counters, portals, destinations, evaluate, maxPortals, isOpen, picker: () => picker && { held: picker.held, hover: picker.hover, closing: picker.closingAt != null, arrows: picker.arrows.map((a) => ({ key: a.key, angleDeg: Math.round(a.angle / DEG), displayDeg: Math.round(a.displayAngle / DEG), distanceCells: a.distanceCells, ok: a.status.ok, reason: a.status.reason, fuel: a.status.fuel })) }, logic: MRLogic };
