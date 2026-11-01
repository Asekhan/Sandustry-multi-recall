# Multi-Recall

A Sandustry mod: keep several recall portals and choose where the Recall Shard takes you.
Sandustry 0.6.0.

## Use

- **Place a portal:** hold the Recall Shard and right-click. The line above the hotbar shows your portal count and cap.
- **Recall:** left-click opens a ring of arrows around you, one per portal, with its distance in cells. Click an arrow, or press, point and release. Right-click, Escape or the centre cancels. Portals closer than 25 cells aren't offered.
- **Fuel:** Voidbloom stacked above the destination portal, as in vanilla. A trip costs 48 cells by default (3× vanilla). Portals short of fuel or blocked show dimmed, with what's missing.
- **Research:** Recall Network I / II / III (alien branch, after the Recall Shard) raise the cap to 2 / 5 / 10 portals. Without them you keep the vanilla single portal. Portals over the cap are never removed; you just can't place more.

## Options

Options > Mods > Multi-Recall. Changes apply at once.

| Option | Default | Range |
|---|---|---|
| Trip cost (× vanilla) | 3 (48 cells) | 0 to 10; 0 = free |
| Recall Network I / II / III cost (thousands) | 15 / 40 / 100 | 1 to 500 |

## Build

```bash
python -I tools/build.py
```

Copy `mod/` to `%APPDATA%\sandustry\mods\asekhan.multirecall\` and restart the game. Every number lives in `src/config.json`; the in-game options take their defaults from it. The logic tests run in the game's own JS engine through the [Sandustry MCP bridge](https://github.com/Asekhan/Sandustry-mcp-bridge), with the game running: `python -I tools/run_tests.py`.

## How it works

- `items.updateDefinition("recallDevice", { handleAction, afterRender })` takes over the vanilla shard without a bundle patch.
- Portals are vanilla `homeBeacon` structures, read from the world each frame the ring is open. A portal placed over the cap by another route is removed on `building:placed`.
- Research nodes come from `tech.registerNode`, under the tech that unlocks `recallDevice`; option changes reprice them with `tech.updateDefinition`.

## License

MIT
