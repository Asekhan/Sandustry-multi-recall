"""Runs tests/logic.test.js in the running game page (any scene) through the MCP bridge.
No Node on this machine, so the game's own JS engine is the test runtime.

    python -I tools/run_tests.py
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERVER = ROOT.parent.parent / "lab" / "mcp-bridge" / "server" / "sandustry_mcp.py"

code = (ROOT / "src" / "logic.js").read_text(encoding="utf-8") + "\n" + (ROOT / "tests" / "logic.test.js").read_text(encoding="utf-8")
res = subprocess.run([sys.executable, "-I", str(SERVER), "--call", "eval", json.dumps({"code": code})], capture_output=True, text=True)
print(res.stdout or res.stderr)
sys.exit(0 if '"failed": []' in res.stdout else 1)
