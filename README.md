# Multi-Recall (`asekhan.multirecall`)

A Sandustry mod: keep several recall portals and choose where the Recall Shard takes you.

Tested on Steam 0.6.0 (Sandkit `apiVersion` 1).

## Use

- **Place portals:** hold the Recall Shard and **right-click**. A small line above the hotbar shows how many portals you have and the cap. With no portal at all, a left click places the first one, as in vanilla.
- **Recall:** left-click opens a ring of arrows around you, one per portal, pointing where it is (off-screen ones included), with the distance in cells. The portal you're standing on isn't listed.
  - Quick click to open, then click an arrow.
  - Or press, point at an arrow, release.
  - Cancel: release after holding over half a second without pointing at anything, click the centre, right-click, or Escape.
- **Fuel:** Voidbloom stacked in the 4-wide column directly above the destination portal's base, as in vanilla. A trip costs **64 cells** (4× vanilla's 16), so the column is 16 cells tall and needs walls. Portals that are short of fuel or blocked stay on the ring, dimmed, showing what's missing ("16/64", "blocked").
- **Research** (alien branch, after vanilla Recall): Recall Network I / II / III raise the cap to **2 / 5 / 10** portals. They cost 15,000 / 40,000 / 100,000. Without them you get the vanilla single portal.

Portals you already have are never removed if you're over the cap; you just can't place more.

## Configuration

`src/config.json`, then rebuild:

| Key | Default | Meaning |
|---|---|---|
| `tripCostCells` | 64 | Voidbloom cells per trip (vanilla: 16) |
| `baseMaxPortals` | 1 | Cap before any research |
| `techs` | 2 / 5 / 10 at 15k / 40k / 100k | Research nodes: `id`, `maxPortals`, `cost` |
| `parentTech` | `Recall` | Vanilla tech the chain hangs from (an `enums.Tech` name) |
| `cooldownMs` | 3000 | Time between trips (vanilla shard cooldown) |
| `holdConfirmMs` / `holdCancelMs` | 220 / 500 | Hold longer than this to confirm on release / to cancel on release when pointing at nothing |
| `maxSelectDeg`, `minSeparationDeg`, `deadZonePx`, `ringRadiusPx` | 35, 30, 34, 130 | Picker geometry |
| `openAnimMs` / `closeAnimMs` | 140 / 110 | Ring animation |

## Build and install

```bash
python -I tools/build.py
```

Copy `mod/` to `%APPDATA%\sandustry\mods\asekhan.multirecall\` and restart the game. The logic tests run in the game's own JS engine, through the Sandustry MCP bridge, with the game running:

```bash
python -I tools/run_tests.py
```

## How it works

- `items.updateDefinition("recallDevice", { handleAction, afterRender })` takes over the vanilla shard with no bundle patch. `handleAction` runs every frame while the shard is held, with the left button's click/hold/release state.
- Right-click and Escape are captured on `window` (capture phase), and only while the shard is held over the game canvas, so the pause menu and other tools don't see them.
- Portals are vanilla `homeBeacon` structures, read fresh from the world every frame the picker is open, so placing, removing and reloading can't leave stale entries. A portal placed over the cap by any other route is removed on `building:placed`.
- Research nodes come from `tech.registerNode`. Vanilla tech ids are numeric (`enums.Tech.Recall` is 85).

## License

MIT
