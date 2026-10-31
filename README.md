# Multi-Recall (`asekhan.multirecall`)

A Sandustry mod: keep several recall portals and choose where the Recall Shard takes you.

Tested on Steam 0.6.0 (Sandkit `apiVersion` 1).

## Use

- **Place portals:** hold the Recall Shard and **right-click**. A small line above the hotbar shows how many portals you have and the cap. With no portal at all, a left click places the first one, as in vanilla.
- **Recall:** left-click opens a ring of arrows around you, one per portal, pointing where it is (off-screen ones included), with the distance in cells. Portals closer than 25 cells aren't listed (you'd walk).
  - The ring stands for a typical trip of about 1,000 cells. Nearer portals' arrows sit inside it, farther ones outside, on a gentle log scale.
  - Quick click to open, then click an arrow.
  - Or press, point at an arrow, release (hold at least 200 ms).
  - A held release always closes the ring: a trip, or a refusal message if that portal can't take you.
  - Cancel: hold 200 ms or more without pointing at anything and release, click the centre, right-click, or Escape.
- **Fuel:** Voidbloom stacked in the 4-wide column directly above the destination portal's base, as in vanilla. A trip costs **48 cells** by default (3× vanilla's 16), so the column is 12 cells tall and needs walls. Portals that are short of fuel or blocked stay on the ring, dimmed, with the distance and what's missing ("181 cells (16/48)", "(blocked)").
- **Research** (alien branch, after the vanilla tech that unlocks the shard): Recall Network I / II / III raise the cap to **2 / 5 / 10** portals. They cost 15,000 / 40,000 / 100,000. Without them you get the vanilla single portal.

Portals you already have are never removed if you're over the cap; you just can't place more. Portals can't be copied or picked (vanilla flags), so copy/paste can't get around the cap.

## Options (in game)

Pause menu or main menu > Options > Mods > Multi-Recall. Changes apply at once, research prices included.

| Option | Default | Range |
|---|---|---|
| Trip cost (× vanilla) | 3 (48 cells) | 0 to 10, steps of 0.25; 0 = free |
| Recall Network I / II / III research cost (thousands) | 15 / 40 / 100 | 1 to 500 |

## Configuration (build time)

`src/config.json`, then rebuild. The options above take their defaults from here.

| Key | Default | Meaning |
|---|---|---|
| `tripCostMultiplier` | 3 | Default trip cost, × vanilla's 16 cells |
| `baseMaxPortals` | 1 | Cap before any research |
| `techs` | 2 / 5 / 10 at 15k / 40k / 100k | Research nodes: `id`, `maxPortals`, default `cost` |
| `parentUnlocksItem` | `recallDevice` | The chain hangs from the vanilla tech that unlocks this item (`parentTech`, an `enums.Tech` name, is the fallback) |
| `cooldownMs` | 3000 | Time between trips (vanilla shard cooldown) |
| `hideNearCells` | 25 | Portals closer than this aren't offered |
| `ringDistanceCells`, `ringPx` | 1000, 120 | The ring is drawn at `ringPx` and stands for this distance |
| `radiusLogGain`, `arrowMinPx`, `arrowMaxPx` | 0.25, 62, 200 | Arrow radius = `ringPx × (1 + gain × ln(distance / ringDistanceCells))`, clamped |
| `minSeparationDeg`, `minSeparationFloorDeg`, `separationRadialPx` | 20, 8, 40 | Arrows on the same radius stay 20° apart; arrows 40 px or more apart in radius may come down to 8° |
| `holdConfirmMs` / `holdCancelMs` | 200 / 200 | Hold at least this long to confirm on release / to cancel on release when pointing at nothing |
| `maxSelectDeg`, `deadZonePx` | 35, 34 | Picker selection |
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
- Research nodes come from `tech.registerNode`. The parent is found by scanning `enums.Tech` for the definition whose `unlocks.items` contains `recallDevice` (85 on 0.6.0). Option changes reprice them with `tech.updateDefinition`.
- Options are a `configSchema` in `modinfo.json` (written by `tools/build.py`), read with `api.settings.get` and watched with `api.settings.onChange`.

## License

MIT
