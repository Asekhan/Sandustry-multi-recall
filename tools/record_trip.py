"""Record the Workshop trip GIF: the ring opens at the hub portal, the pointer moves to a destination, click, and the
player arrives there. Needs the game running with the DevTools port, Dev Kit and Multi-Recall installed, and the
"Multi-Recall showcase" world loaded (or any world with portals). The capture box follows the player, so the
departure and the arrival are both in frame.

    python -I mods/multi-recall/tools/record_trip.py OUT.gif --hub 2480,1212 --to 2560,3216 [--w 200 --h 124 --scale 1]
"""
import argparse, base64, importlib.util, json, math, os, time

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE = os.path.join(HERE, "..", "..", "mcp-bridge", "server", "sandustry_mcp.py")


def load_bridge():
    spec = importlib.util.spec_from_file_location("sandustry_mcp", BRIDGE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--hub", default="2480,1212", help="portal the player leaves from (cell x,y)")
    ap.add_argument("--to", default="2560,3216", help="destination portal key (cell x,y)")
    ap.add_argument("--w", type=int, default=200, help="capture box width in cells")
    ap.add_argument("--h", type=int, default=124, help="capture box height in cells")
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--fps", type=float, default=30)
    a = ap.parse_args()
    b = load_bridge()
    hx, hy = (int(v) for v in a.hub.split(","))

    # Stand on the hub, hold the shard, ghost cursor on the real pointer.
    b.js(f"""need();
      api.player.setPosition(S, {(hx + 2) * 4}, {(hy - 17) * 4}); api.player.setVelocity(S, 0, 0); api.camera.snapToPlayer(S);
      sk.api.ui.hotbar.selectAction({{ type: sk.enums.ActionType.Mod, id: "recallDevice" }});
      return true;""")
    time.sleep(2.5)  # let the player land on the heap before recording (setup only; nothing here is game logic)

    def screen_of_world(wx, wy):
        return b.js(f"""need(); const d = sk.api.rendering.getDrawPositionAtWorld({wx}, {wy});
          const c = S.session.rendering.overlayCanvas, r = c.getBoundingClientRect();
          return {{ x: r.left + d.x * r.width / c.width, y: r.top + d.y * r.height / c.height }};""")

    def player_screen():
        return b.js("""need(); const p = S.store.player, w = p.width || 8, h = p.height || 12;
          const d = sk.api.rendering.getDrawPositionAtWorld(p.x + w / 2, p.y + h / 2);
          const c = S.session.rendering.overlayCanvas, r = c.getBoundingClientRect();
          return { x: r.left + d.x * r.width / c.width, y: r.top + d.y * r.height / c.height, k: r.width / c.width };""")

    def move(x, y):
        b.cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})

    def click(x, y, hold=0.06):
        base = {"x": x, "y": y, "button": "left", "clickCount": 1}
        b.cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", **base})
        time.sleep(hold)
        b.cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", **base})

    p = player_screen()
    start = (p["x"] + 60, p["y"] - 50)
    move(*start)
    # Recording starts un-awaited; it follows the player and stops 2 s after the trip.
    b.js(f"""need();
      const R = window.__multiRecall, trips0 = R.counters.trips;
      const box = {{ get x0() {{ return S.store.player.x / 4 - {a.w / 2}; }}, get x1() {{ return S.store.player.x / 4 + {a.w / 2}; }},
                    get y0() {{ return S.store.player.y / 4 - {a.h * 0.55}; }}, get y1() {{ return S.store.player.y / 4 + {a.h * 0.45}; }} }};
      const m = S.session.input.mouse.worldPosition;
      devkit.cursor.show(m.x / 4, m.y / 4);
      const off = sk.api.events.on("frame:render", () => {{ const w = S.session.input.mouse.worldPosition; devkit.cursor.show(w.x / 4, w.y / 4); }});
      window.__tripRec = devkit.recordBase64(box, {{ fps: {a.fps}, seconds: 14, scale: {a.scale}, hideDev: true,
        until: () => R.counters.trips > trips0, tail: 2200 }}).finally(() => {{ off(); devkit.cursor.hide(); }});
      return true;""")
    time.sleep(0.8)
    click(*start)  # opens the ring
    time.sleep(0.7)
    arrows = b.js(f"""need(); const pk = window.__multiRecall.picker(); return pk && pk.arrows;""")
    target = next((x for x in arrows or [] if x["key"] == a.to), None)
    if not target:
        raise SystemExit(f"no arrow for {a.to}: {arrows}")
    p = player_screen()
    ang = math.radians(target["displayDeg"])
    rad = target["radius"] * p["k"]  # overlay px -> css px
    goal = (p["x"] + math.cos(ang) * rad, p["y"] + math.sin(ang) * rad)
    steps = 28
    for i in range(1, steps + 1):  # eased pointer path
        u = i / steps
        e = u * u * (3 - 2 * u)
        move(start[0] + (goal[0] - start[0]) * e, start[1] + (goal[1] - start[1]) * e)
        time.sleep(0.035)
    time.sleep(0.9)
    click(*goal)
    info = b.js("""need(); const r = await window.__tripRec; window.__devkitGif = r.gif;
      return { frames: r.frames, width: r.width, height: r.height, gaps: r.gaps, length: r.gif.length };""", timeout=300)
    parts, step = [], 1 << 20
    for i in range(0, info["length"], step):
        parts.append(b.cdp.evaluate(f"window.__devkitGif.slice({i}, {i + step})"))
    b.cdp.evaluate("delete window.__devkitGif; delete window.__tripRec")
    data = base64.b64decode("".join(parts))
    with open(a.out, "wb") as fh:
        fh.write(data)
    print(f"{a.out}: {info['frames']} frames, {info['width']}x{info['height']}, {len(data) // 1024} KB, {info['gaps']} hitches")


if __name__ == "__main__":
    main()
