// Recall Network runtime. Takes over the vanilla Recall Shard (recallDevice) through items.updateDefinition:
// any number of vanilla recall portals (homeBeacon), a radial destination picker, a flat per-trip Voidbloom cost.
const MOD_ID = "asekhan.recallnetwork";
const SHARD = "recallDevice", PORTAL = "homeBeacon";
const CELL = 4; // px per cell
const api = sandkit.api, S = sandkit.state;
const GLOOM = sandkit.enums.ElementType.Gloom; // Voidbloom
const ActionState = sandkit.enums.ActionState, ActionType = sandkit.enums.ActionType;
const DEG = Math.PI / 180;

const log = (msg) => { try { window.electron.log("info", "recall-network", msg); } catch (_) {} };
const counters = { trips: 0, refused: 0, cancelled: 0, fuelSpent: 0, opened: 0 };

api.i18n.register("en", {
  "mods|recallNetwork|modeRecall": "Recall",
  "mods|recallNetwork|modePlace": "Place portal",
  "mods|recallNetwork|hint": "Click: choose destination",
  "mods|recallNetwork|none": "No recall portals. Use Place portal.",
  "mods|recallNetwork|cooldown": "Recall shard recharging.",
  "mods|recallNetwork|cost": "{cost} Voidbloom per trip",
  "mods|recallNetwork|help": "Release or click a destination · Esc / right-click / centre: cancel",
});
const t = (key, params) => api.i18n.t("mods|recallNetwork|" + key, params);
const toast = (key, params) => api.ui.toast({ key, params });

// ---- per-world storage: stable labels ----
function store() {
  const s = api.storage.ensure("recallNetwork");
  if (s.version === undefined) { s.version = 1; s.labels = {}; s.nextLabel = 0; s.lastTripAt = null; }
  return s;
}
const posKey = (x, y) => x + "," + y;

// ---- portals: always rebuilt from the world's structures, never cached across frames ----
function portals() {
  const s = store(), list = [], seen = {};
  for (const st of S.store.structures) {
    if (st.type !== PORTAL) continue;
    const k = posKey(st.x, st.y);
    if (!(k in s.labels)) s.labels[k] = RNLogic.labelFor(s.nextLabel++);
    seen[k] = true;
    list.push({ key: k, x: st.x, y: st.y, queued: !!st.queued, label: s.labels[k] });
  }
  for (const k of Object.keys(s.labels)) if (!seen[k]) delete s.labels[k];
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

const fuelCellsOf = (pt) => RNLogic.fuelCells(pt.x, pt.y, CONFIG.tripCostCells, CONFIG.fuelColumnWidthCells);
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

// ---- picker state (session only: a picker never survives a reload) ----
let picker = null; // { openedAt, held, hover, arrows }
const nowReal = () => performance.now();

function openPicker() {
  const list = portals();
  if (list.length === 0) { toast("mods|recallNetwork|none"); return; }
  picker = { openedAt: nowReal(), held: true, hover: null, arrows: [] };
  counters.opened++;
}
function closePicker(reason) {
  if (!picker) return;
  picker = null;
  if (reason === "cancel") { counters.cancelled++; log("picker cancelled"); }
}

function confirm(key) {
  const pt = portals().find((p) => p.key === key);
  if (!pt) { counters.refused++; toast("mods|homeBeacon|notBuiltYet"); return false; }
  const s = store(), now = api.time.getTimeMs();
  if (s.lastTripAt != null && now >= s.lastTripAt && now - s.lastTripAt < CONFIG.cooldownMs) { counters.refused++; toast("mods|recallNetwork|cooldown"); return false; }
  const ev = evaluate(pt);
  if (!ev.ok) { counters.refused++; toast(ev.reason); log("refused " + pt.label + ": " + ev.reason); return false; }
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
  log("trip to " + pt.label + " (" + pt.key + "), spent " + CONFIG.tripCostCells);
  return true;
}

// Pointer vector from the player, in overlay draw space (same space the picker is drawn in).
function pointer() {
  const c = playerCenter(), m = S.session.input.mouse.worldPosition;
  const pc = api.rendering.getDrawPositionAtWorld(c.x, c.y), pm = api.rendering.getDrawPositionAtWorld(m.x, m.y);
  return { cx: pc.x, cy: pc.y, dx: pm.x - pc.x, dy: pm.y - pc.y };
}

function refreshArrows() {
  const c = playerCenter();
  const items = portals().map((pt) => {
    const a = arrivalOf(pt), p = player();
    const ax = a.x + p.width / 2, ay = a.y + p.height / 2;
    return Object.assign(pt, {
      angle: Math.atan2(ay - c.y, ax - c.x),
      distanceCells: Math.round(Math.hypot(ax - c.x, ay - c.y) / CELL),
      status: evaluate(pt),
    });
  });
  // The highlighted portal vanished (removed while choosing): cancel rather than let the highlight slide to a neighbour.
  if (picker.hover && !items.some((it) => it.key === picker.hover)) { closePicker("cancel"); toast("mods|homeBeacon|notBuiltYet"); return false; }
  picker.arrows = RNLogic.layout(items, CONFIG.minSeparationDeg * DEG);
  const ptr = pointer();
  picker.hover = RNLogic.pick(picker.arrows, ptr.dx, ptr.dy, CONFIG.deadZonePx, CONFIG.maxSelectDeg * DEG);
  return true;
}

// ---- input the game would otherwise act on while the picker is open ----
window.addEventListener("keydown", (e) => {
  if (!picker || e.key !== "Escape") return;
  e.preventDefault(); e.stopImmediatePropagation();
  closePicker("cancel");
}, true);
const swallowRight = (e) => {
  if (!picker || e.button !== 2) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.type === "mousedown" || e.type === "pointerdown") closePicker("cancel");
};
for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "contextmenu"]) window.addEventListener(type, swallowRight, true);

// ---- the shard ----
function handleAction(state) {
  const st = state.session.action.state;
  const mode = api.items.modes.getActiveId(SHARD);
  if (!picker && (mode === "place" || portals().length === 0)) {
    // Vanilla behaviour without a portal, and our Place mode: hand over to portal placement.
    api.items.modes.setActiveId(SHARD, "recall");
    api.ui.hotbar.selectAction({ type: ActionType.Building, id: PORTAL });
    return;
  }
  if (!picker) { if (st[ActionState.Start]) { openPicker(); if (picker && st[ActionState.End]) picker.held = false; } return; }
  if (!refreshArrows()) return;
  if (picker.held) {
    if (!st[ActionState.End]) return;
    // Release: a hold that pointed at a destination confirms it; a quick click leaves the picker open.
    picker.held = false;
    if (nowReal() - picker.openedAt >= CONFIG.holdConfirmMs && picker.hover) { const k = picker.hover; if (confirm(k)) closePicker("trip"); }
    return;
  }
  if (st[ActionState.Start]) {
    if (!picker.hover) { closePicker("cancel"); return; } // centre dead zone or no direction: cancel
    const k = picker.hover; if (confirm(k)) closePicker("trip");
  }
}

function drawArrow(ctx, x, y, ang, size, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, size * 0.75); ctx.lineTo(-size * 0.35, 0); ctx.lineTo(-size * 0.7, -size * 0.75); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.stroke();
  ctx.restore();
}
function text(ctx, s, x, y, color, font) {
  ctx.font = font || "bold 13px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function afterRender(state) {
  const act = api.action.getActive();
  const holding = act && act.id === SHARD;
  if (!holding) { if (picker) closePicker("cancel"); return; }
  // The game clears mouse.available while the cursor rests or after a key press; an open picker still takes clicks, so keep drawing it.
  if (!picker) {
    if (!api.input.isMouseAvailable()) return;
    const m = S.session.input.mouse.worldPosition, d = api.rendering.getDrawPositionAtWorld(m.x, m.y);
    api.rendering.withOverlayContext((ctx) => text(ctx, t("hint"), d.x, d.y - 16, "rgba(190,140,255,1)"));
    return;
  }
  if (!refreshArrows()) return;
  const ptr = pointer(), R = CONFIG.ringRadiusPx;
  api.rendering.withOverlayContext((ctx) => {
    ctx.beginPath(); ctx.arc(ptr.cx, ptr.cy, R, 0, RNLogic.TAU); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(190,140,255,0.45)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(ptr.cx, ptr.cy, CONFIG.deadZonePx, 0, RNLogic.TAU); ctx.fillStyle = "rgba(20,0,40,0.45)"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(190,140,255,0.8)"; ctx.stroke();
    text(ctx, "×", ptr.cx, ptr.cy, "rgba(220,200,255,0.9)", "bold 16px monospace");
    for (const ar of picker.arrows) {
      const hov = ar.key === picker.hover, ok = ar.status.ok;
      const ax = ptr.cx + Math.cos(ar.displayAngle) * R, ay = ptr.cy + Math.sin(ar.displayAngle) * R;
      // True bearing tick on the ring, joined to the arrow when it was spread apart from a neighbour.
      if (RNLogic.diff(ar.angle, ar.displayAngle) > 0.5 * DEG) {
        const tx = ptr.cx + Math.cos(ar.angle) * R, ty = ptr.cy + Math.sin(ar.angle) * R;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ax, ay); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, RNLogic.TAU); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill();
      }
      const color = !ok ? (hov ? "rgba(230,120,120,1)" : "rgba(140,110,110,0.75)") : hov ? "rgba(255,230,120,1)" : "rgba(190,140,255,1)";
      drawArrow(ctx, ax, ay, ar.angle, hov ? 17 : 13, color);
      const lx = ptr.cx + Math.cos(ar.displayAngle) * (R + 34), ly = ptr.cy + Math.sin(ar.displayAngle) * (R + 34);
      text(ctx, ar.label, lx, ly - 8, color, hov ? "bold 16px monospace" : "bold 13px monospace");
      const sub = ok ? ar.distanceCells + " cells" : ar.status.reason.endsWith("noVoidbloomFuel") ? "fuel " + ar.status.fuel + "/" + CONFIG.tripCostCells : ar.status.reason.endsWith("destinationBlocked") ? "blocked" : "not built";
      text(ctx, sub, lx, ly + 8, color, "11px monospace");
    }
    text(ctx, t("cost", { cost: CONFIG.tripCostCells }), ptr.cx, ptr.cy + R + 70, "rgba(220,200,255,0.95)");
    text(ctx, t("help"), ptr.cx, ptr.cy + R + 88, "rgba(200,190,220,0.8)", "11px monospace");
  });
}

// ---- mode row above the hotbar while the shard is held (same pattern the vanilla tools use) ----
function renderModes() {
  const h = sandkit.react.createElement, active = api.items.modes.getActiveId(SHARD);
  const buttons = api.items.modes.getAll(SHARD).map((m) => h(api.ui.components.Button, {
    key: m.id, small: true, active: m.id === active, tabIndex: -1,
    onMouseDown: (e) => e.preventDefault(),
    onClick: () => { api.items.modes.setActiveId(SHARD, m.id); api.ui.update(sandkit.enums.ComponentId.HotbarOverlays); },
    className: "whitespace-nowrap", children: m.nameKey ? api.i18n.t(m.nameKey) : m.name,
  }));
  return h("div", { className: "flex flex-nowrap justify-center gap-1 bg-black/75 px-3 py-2 rounded-tr-lg rounded-bl-lg" }, buttons);
}
let modeRow = null;
function syncModeRow() {
  const show = api.items.isActiveById(SHARD);
  if (show && !modeRow) modeRow = api.ui.regions.mount("hotbar", "recallNetworkModes", { placement: "raised", render: renderModes });
  else if (!show && modeRow) { modeRow.unmount(); modeRow = null; }
}

// ---- wiring ----
let installed = false;
function install() {
  if (installed || !api.items.getDefinitionById(SHARD)) return;
  installed = true;
  if (!api.items.modes.getAll(SHARD).some((m) => m.id === "recall")) {
    api.items.modes.register(SHARD, { id: "recall", nameKey: "mods|recallNetwork|modeRecall", order: 0 });
    api.items.modes.register(SHARD, { id: "place", nameKey: "mods|recallNetwork|modePlace", order: 1 });
  }
  api.items.updateDefinition(SHARD, { handleAction, afterRender });
  log("installed v" + VERSION + ", trip cost " + CONFIG.tripCostCells + " (vanilla " + CONFIG.vanillaTripCostCells + ")");
}
api.events.on("game:ready", () => { picker = null; install(); store(); portals(); syncModeRow(); });
api.events.on("action:changed", syncModeRow);
api.events.on("item:modeChanged", syncModeRow);
api.events.on("building:placed", (ev) => { if (ev && ev.structure && ev.structure.type === PORTAL) { portals(); api.items.modes.setActiveId(SHARD, "recall"); } });
api.events.on("building:removed", () => { portals(); });
install();

// Test and inspection handle (read-mostly; the MCP tests drive real input).
window.__recallNetwork = { version: VERSION, config: CONFIG, counters, portals, evaluate, isOpen: () => !!picker, picker: () => picker && { held: picker.held, hover: picker.hover, arrows: picker.arrows.map((a) => ({ key: a.key, label: a.label, angleDeg: Math.round(a.angle / DEG), displayDeg: Math.round(a.displayAngle / DEG), distanceCells: a.distanceCells, ok: a.status.ok, reason: a.status.reason, fuel: a.status.fuel })) }, logic: RNLogic };
