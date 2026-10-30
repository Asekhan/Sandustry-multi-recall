# Recall Network (`asekhan.recallnetwork`) — proof of concept

Turns the vanilla Recall Shard into a network. Place any number of recall portals, then pick a destination from a ring of arrows around you. Each trip costs a flat amount of Voidbloom from the chosen portal's own column. **POC only:** no Workshop publishing, no production art, no balance work.

Tested in game on Steam 0.6.0 (Sandkit `apiVersion` 1): placement, both picking modes, every refusal and cancel path, and save/reload.

`mod/` is build output and isn't in the repo: run the build below, or take the zip from the latest GitHub release.

## Use

- **Hold the Recall Shard.** Two buttons appear above the hotbar: **Recall** and **Place portal**.
- **Place portal:** places a vanilla recall portal. Earlier portals stay. With no portal at all, the shard goes straight to placement, as in vanilla.
- **Recall:** left-click opens the picker, centred on you. Every portal gets an arrow pointing at it (off-screen ones included), with a letter label and the straight-line distance in **cells** (1 cell = 4 px).
  - **Click mode:** quick click to open, then click a direction.
  - **Hold mode:** press, point, release (after 220 ms).
  - **Cancel:** the centre dead zone, Escape or right-click. Nothing is spent.
- **Fuel:** Voidbloom stacked in the 4-wide column directly above the portal's base, as in vanilla, but **32 cells per trip** (vanilla: 16, one full 4×4 tile). That's two tiles high, so the column needs walls. The cost is flat and doesn't change with the number of portals.
- **Unavailable destinations** stay visible but dimmed, with the reason ("fuel 16/32", "blocked", "not built"). Clicking one refuses with the vanilla toast and spends nothing.
- **Near-same bearings:** portals in nearly the same direction are spread at least 30° apart on the ring. A white tick and line mark each one's true bearing.

## Install

```bash
python -I tools/build.py
```

Then copy `mod/` to `%APPDATA%\sandustry\mods\asekhan.recallnetwork\` and restart the game. Logic tests run in the game's own JS engine (no Node here), with the game running:

```bash
python -I tools/run_tests.py
```

## How it works

- **Shard:** `items.updateDefinition("recallDevice", { handleAction, afterRender })` replaces the shard's behaviour with a supported API, with no bundle patch. The game calls `handleAction` every frame while the shard is active, with `ActionState` Start/Active/End (left button click/hold/release).
- **Modes:** `items.modes.register` plus a `ui.regions.mount("hotbar", …, { placement: "raised" })` button row. This is the pattern vanilla tools use for their own mode rows.
- **Portals:** never cached. They're rebuilt every frame the picker is open from `state.store.structures` (type `homeBeacon`), so placement, removal and reload can't leave stale or duplicate entries.
- **Labels:** stored per world in `storage.ensure("recallNetwork")` and never reused.
- **Trip:** revalidate the portal, arrival and fuel → remove the 32 fuel cells (`elements.removeAtCellWhenIdle`, as vanilla) → `player.setPositionAtWorld` at the vanilla arrival point → `camera.snapToPlayer`. The picker closes on the confirming input, so one action makes one trip.
- **Cancel keys:** Escape and right-click are captured on `window` (capture phase) only while the picker is open, so the pause menu doesn't open.
- **Tuning:** values live in `src/config.json`. `tripCostCells` is provisional.

## Limitations

- Vanilla's portal-placed handler still tracks the last portal in its own variable. Without this mod, the vanilla shard uses one portal (the first found at load).
- The vanilla warp shader effect isn't reachable from the API; the trip uses lights, particles and two of the vanilla sound layers.
- The portal you're standing on is listed too (distance 0). Hiding it is a polish choice.
- Mouse and keyboard only. No controller input for the picker.
